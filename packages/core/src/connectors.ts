/**
 * Connectors (see packages/contract/src/connectors.ts): signing users in to remote MCP servers
 * and handing their tokens to runs.
 *
 * Sign-in follows the MCP authorization spec: find the server's authorization server
 * (protected-resource metadata, RFC 9728), register the platform as a public client once per
 * redirect URI (dynamic client registration, RFC 7591), then authorization code + PKCE with the
 * MCP server as the resource (RFC 8707). Access tokens are refreshed when a run needs them;
 * refreshes are serialized per user and connector because some servers rotate refresh tokens.
 */
import { createHash, randomBytes } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { connectorById, type Connector, type ConnectorId } from "@appbuilder/contract";
import { schema, type Database } from "@appbuilder/db";
import { decryptSecret, encryptSecret } from "./crypto";

type Fetch = typeof fetch;

const TIMEOUT = 10_000;
const CLIENT_NAME = "App Builder";

/** The connector's MCP server; CONNECTOR_<ID>_URL overrides it (tests, self-hosted servers). */
export function connectorUrl(connector: Connector): string | null {
  const key = `CONNECTOR_${connector.id.toUpperCase().replace(/-/g, "_")}_URL`;
  return process.env[key] || connector.mcpUrl;
}

export interface AuthServer {
  authorizationEndpoint: string;
  tokenEndpoint: string;
  registrationEndpoint: string | null;
  /** The MCP server as an OAuth resource (sent as `resource` on every request). */
  resource: string;
  scope: string | null;
}

async function getJson(url: string, fetchImpl: Fetch): Promise<Record<string, unknown> | null> {
  try {
    const response = await fetchImpl(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!response.ok) return null;
    return (await response.json()) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** "/mcp" → ["/.well-known/x/mcp", "/.well-known/x"]; "/" → ["/.well-known/x"]. */
function wellKnown(url: URL, name: string): string[] {
  const path = url.pathname.replace(/\/$/, "");
  const urls = path ? [`${url.origin}/.well-known/${name}${path}`] : [];
  urls.push(`${url.origin}/.well-known/${name}`);
  return urls;
}

/** Find the MCP server's authorization server and its endpoints. */
export async function discoverAuthServer(
  mcpUrl: string,
  fetchImpl: Fetch = fetch,
): Promise<AuthServer> {
  const server = new URL(mcpUrl);
  let metadata: Record<string, unknown> | null = null;
  for (const url of wellKnown(server, "oauth-protected-resource")) {
    metadata = await getJson(url, fetchImpl);
    if (metadata) break;
  }
  const issuers = metadata?.authorization_servers;
  const issuer = new URL(
    Array.isArray(issuers) && typeof issuers[0] === "string" ? issuers[0] : server.origin,
  );
  let auth: Record<string, unknown> | null = null;
  for (const url of [
    ...wellKnown(issuer, "oauth-authorization-server"),
    ...wellKnown(issuer, "openid-configuration"),
  ]) {
    auth = await getJson(url, fetchImpl);
    if (auth?.authorization_endpoint && auth.token_endpoint) break;
    auth = null;
  }
  if (!auth) throw new Error(`${server.host} doesn't publish OAuth sign-in details.`);
  const scopes = metadata?.scopes_supported;
  return {
    authorizationEndpoint: String(auth.authorization_endpoint),
    tokenEndpoint: String(auth.token_endpoint),
    registrationEndpoint:
      typeof auth.registration_endpoint === "string" ? auth.registration_endpoint : null,
    resource: typeof metadata?.resource === "string" ? metadata.resource : mcpUrl,
    scope: Array.isArray(scopes) && scopes.length ? scopes.join(" ") : null,
  };
}

/** The platform's client at this connector's authorization server, registered on first use. */
export async function connectorClient(
  db: Database,
  connector: Connector,
  auth: AuthServer,
  redirectUri: string,
  fetchImpl: Fetch = fetch,
): Promise<{ clientId: string; clientSecret: string | null }> {
  const [existing] = await db
    .select()
    .from(schema.connectorClient)
    .where(
      and(
        eq(schema.connectorClient.connectorId, connector.id),
        eq(schema.connectorClient.redirectUri, redirectUri),
      ),
    );
  if (existing) {
    return {
      clientId: existing.clientId,
      clientSecret: existing.encryptedClientSecret
        ? decryptSecret(existing.encryptedClientSecret)
        : null,
    };
  }
  if (!auth.registrationEndpoint)
    throw new Error(`${connector.name} doesn't let apps register for sign-in.`);
  const response = await fetchImpl(auth.registrationEndpoint, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      client_name: CLIENT_NAME,
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    }),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const body = (await response.json().catch(() => ({}))) as {
    client_id?: string;
    client_secret?: string;
    error_description?: string;
  };
  if (!response.ok || !body.client_id)
    throw new Error(
      `${connector.name} refused to register the app (${response.status}${body.error_description ? `: ${body.error_description}` : ""}).`,
    );
  await db
    .insert(schema.connectorClient)
    .values({
      connectorId: connector.id,
      redirectUri,
      clientId: body.client_id,
      encryptedClientSecret: body.client_secret ? encryptSecret(body.client_secret) : null,
    })
    .onConflictDoNothing();
  return { clientId: body.client_id, clientSecret: body.client_secret ?? null };
}

/** What the callback needs to finish a sign-in (kept in an encrypted, short-lived cookie). */
export interface PendingAuthorization {
  connectorId: ConnectorId;
  userId: string;
  state: string;
  verifier: string;
  redirectUri: string;
  clientId: string;
  tokenEndpoint: string;
  resource: string;
  /** Where to send the user afterwards (a path on the builder). */
  returnTo: string;
}

/** Start a sign-in: the URL to send the user to, and what to remember until they return. */
export async function startAuthorization(input: {
  db: Database;
  connector: Connector;
  userId: string;
  redirectUri: string;
  returnTo: string;
  fetchImpl?: Fetch;
}): Promise<{ url: string; pending: PendingAuthorization }> {
  const mcpUrl = connectorUrl(input.connector);
  if (!mcpUrl || !input.connector.oauth)
    throw new Error(`${input.connector.name} can't be connected by signing in.`);
  const auth = await discoverAuthServer(mcpUrl, input.fetchImpl);
  const client = await connectorClient(
    input.db,
    input.connector,
    auth,
    input.redirectUri,
    input.fetchImpl,
  );
  const verifier = randomBytes(32).toString("base64url");
  const state = randomBytes(16).toString("base64url");
  const url = new URL(auth.authorizationEndpoint);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", client.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("state", state);
  url.searchParams.set("code_challenge", createHash("sha256").update(verifier).digest("base64url"));
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("resource", auth.resource);
  if (auth.scope) url.searchParams.set("scope", auth.scope);
  return {
    url: url.toString(),
    pending: {
      connectorId: input.connector.id,
      userId: input.userId,
      state,
      verifier,
      redirectUri: input.redirectUri,
      clientId: client.clientId,
      tokenEndpoint: auth.tokenEndpoint,
      resource: auth.resource,
      returnTo: input.returnTo,
    },
  };
}

interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
}

class TokenError extends Error {
  constructor(
    message: string,
    readonly code: string | undefined,
  ) {
    super(message);
  }
}

async function tokenRequest(
  endpoint: string,
  params: Record<string, string>,
  fetchImpl: Fetch,
): Promise<Required<Pick<TokenResponse, "access_token">> & TokenResponse> {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: new URLSearchParams(params).toString(),
    signal: AbortSignal.timeout(TIMEOUT),
  });
  const body = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!response.ok || !body.access_token)
    throw new TokenError(
      body.error_description || body.error || `Token request failed (${response.status}).`,
      body.error,
    );
  return body as Required<Pick<TokenResponse, "access_token">> & TokenResponse;
}

async function clientSecretFor(
  db: Database,
  connectorId: string,
  clientId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ secret: schema.connectorClient.encryptedClientSecret })
    .from(schema.connectorClient)
    .where(
      and(
        eq(schema.connectorClient.connectorId, connectorId),
        eq(schema.connectorClient.clientId, clientId),
      ),
    );
  return row?.secret ? decryptSecret(row.secret) : null;
}

/** Finish a sign-in: trade the code for tokens and save them as the user's connection. */
export async function completeAuthorization(input: {
  db: Database;
  pending: PendingAuthorization;
  code: string;
  fetchImpl?: Fetch;
}): Promise<void> {
  const { pending } = input;
  const connector = connectorById(pending.connectorId);
  if (!connector) throw new Error("Unknown connector.");
  const secret = await clientSecretFor(input.db, connector.id, pending.clientId);
  const tokens = await tokenRequest(
    pending.tokenEndpoint,
    {
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: pending.redirectUri,
      client_id: pending.clientId,
      code_verifier: pending.verifier,
      resource: pending.resource,
      ...(secret ? { client_secret: secret } : {}),
    },
    input.fetchImpl ?? fetch,
  );
  const values = {
    encryptedToken: encryptSecret(tokens.access_token),
    label: "Signed in",
    auth: "oauth" as const,
    encryptedRefreshToken: tokens.refresh_token ? encryptSecret(tokens.refresh_token) : null,
    expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
    oauth: {
      clientId: pending.clientId,
      tokenEndpoint: pending.tokenEndpoint,
      resource: pending.resource,
    },
  };
  await input.db
    .insert(schema.integration)
    .values({ userId: pending.userId, provider: connector.id, ...values })
    .onConflictDoUpdate({
      target: [schema.integration.userId, schema.integration.provider],
      set: values,
    });
}

/**
 * Check a pasted token against the connector's MCP server by opening a session. `null` when
 * the server rejects it, `undefined` when it couldn't be reached (the caller goes ahead).
 */
export async function checkConnectorToken(
  connector: Connector,
  token: string,
  fetchImpl: Fetch = fetch,
): Promise<{ server: string | null } | null | undefined> {
  const url = connectorUrl(connector);
  if (!url) return undefined;
  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
      },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-06-18",
          capabilities: {},
          clientInfo: { name: "app-builder", version: "1.0.0" },
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
  } catch {
    return undefined;
  }
  if (response.status === 401 || response.status === 403) return null;
  if (!response.ok) return undefined;
  const text = await response.text().catch(() => "");
  // JSON, or a server-sent event whose data line is the JSON-RPC response.
  const json = text.trim().startsWith("{")
    ? text
    : (text
        .split("\n")
        .find((line) => line.startsWith("data:"))
        ?.slice(5) ?? "");
  try {
    const parsed = JSON.parse(json) as { result?: { serverInfo?: { name?: string } } };
    return { server: parsed.result?.serverInfo?.name ?? null };
  } catch {
    return { server: null };
  }
}

/** A JSON-RPC result from an MCP server, sent as JSON or as a server-sent event. */
function rpcResult(text: string): Record<string, unknown> | null {
  const json = text.trim().startsWith("{")
    ? text
    : (text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5))
        .find((line) => line.includes('"result"') || line.includes('"error"')) ?? "");
  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export type ConnectorTest =
  { ok: true; server: string | null; tools: string[] } | { ok: false; error: string };

/**
 * Settings → Connectors → Test: open an MCP session with the connection's (fresh) token and
 * list its tools, the same way builds reach it. Reads nothing from the user's data.
 */
export async function testConnector(
  access: ConnectorAccess,
  fetchImpl: Fetch = fetch,
): Promise<ConnectorTest> {
  let sessionId: string | null = null;
  const call = async (id: number | null, method: string, params: object = {}) => {
    const response = await fetchImpl(access.url, {
      method: "POST",
      headers: {
        authorization: `Bearer ${access.token}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...(sessionId ? { "mcp-session-id": sessionId } : {}),
        ...(method !== "initialize" ? { "mcp-protocol-version": "2025-06-18" } : {}),
      },
      body: JSON.stringify({ jsonrpc: "2.0", ...(id === null ? {} : { id }), method, params }),
      signal: AbortSignal.timeout(TIMEOUT),
    });
    sessionId = response.headers.get("mcp-session-id") ?? sessionId;
    return response;
  };
  try {
    const init = await call(1, "initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "app-builder", version: "1.0.0" },
    });
    if (init.status === 401 || init.status === 403)
      return { ok: false, error: `${access.name} rejected the connection: connect it again.` };
    if (!init.ok) return { ok: false, error: `${access.name} answered ${init.status}.` };
    const hello = rpcResult(await init.text()) as {
      result?: { serverInfo?: { name?: string } };
    } | null;
    await call(null, "notifications/initialized");
    const list = await call(2, "tools/list");
    if (!list.ok)
      return { ok: false, error: `${access.name} answered ${list.status} to tools/list.` };
    const tools = rpcResult(await list.text()) as {
      result?: { tools?: Array<{ name?: string }> };
      error?: { message?: string };
    } | null;
    if (!tools?.result)
      return { ok: false, error: tools?.error?.message ?? `${access.name} didn't list its tools.` };
    return {
      ok: true,
      server: hello?.result?.serverInfo?.name ?? null,
      tools: (tools.result.tools ?? []).map((t) => String(t.name ?? "")).filter(Boolean),
    };
  } catch (error) {
    return { ok: false, error: `Couldn't reach ${access.name} (${(error as Error).message}).` };
  }
}

export interface ConnectorAccess {
  id: ConnectorId;
  name: string;
  url: string;
  token: string;
}

/**
 * The user's working connections among `ids`, with fresh tokens. `problems` says, in words for
 * the chat, which named connectors can't be used and what the user can do about it.
 */
export async function connectorAccess(
  db: Database,
  userId: string,
  ids: ConnectorId[],
  fetchImpl: Fetch = fetch,
): Promise<{ connectors: ConnectorAccess[]; problems: string[] }> {
  const connectors: ConnectorAccess[] = [];
  const problems: string[] = [];
  if (!ids.length) return { connectors, problems };
  const rows = await db
    .select()
    .from(schema.integration)
    .where(and(eq(schema.integration.userId, userId), inArray(schema.integration.provider, ids)));
  for (const id of ids) {
    const connector = connectorById(id)!;
    const url = connectorUrl(connector);
    const row = rows.find((r) => r.provider === id);
    if (!url || connector.unavailable) {
      problems.push(`${connector.name} can't be connected yet, so I didn't use it.`);
      continue;
    }
    if (!row) {
      problems.push(
        `${connector.name} isn't connected. Connect it in Settings → Connectors and ask again to use it.`,
      );
      continue;
    }
    try {
      connectors.push({
        id,
        name: connector.name,
        url,
        token: await freshToken(db, userId, id, fetchImpl),
      });
    } catch (error) {
      problems.push(
        `${connector.name} needs you to connect it again in Settings → Connectors (${(error as Error).message}).`,
      );
    }
  }
  return { connectors, problems };
}

/** The connection's access token, refreshed first when it is about to expire. */
async function freshToken(
  db: Database,
  userId: string,
  provider: ConnectorId,
  fetchImpl: Fetch,
): Promise<string> {
  const where = and(
    eq(schema.integration.userId, userId),
    eq(schema.integration.provider, provider),
  );
  const outcome = await db.transaction(
    async (tx): Promise<{ token: string } | { error: Error; refused: boolean }> => {
      // Lock the row: two runs refreshing a rotating refresh token at once would log the user out.
      const [row] = await tx.select().from(schema.integration).where(where).for("update");
      if (!row) return { error: new Error("not connected"), refused: false };
      const expiring = row.expiresAt && row.expiresAt.getTime() < Date.now() + 60_000;
      if (!expiring) return { token: decryptSecret(row.encryptedToken) };
      if (!row.encryptedRefreshToken || !row.oauth)
        return { error: new Error("the sign-in expired"), refused: false };
      const secret = await clientSecretFor(tx as unknown as Database, provider, row.oauth.clientId);
      let tokens: Awaited<ReturnType<typeof tokenRequest>>;
      try {
        tokens = await tokenRequest(
          row.oauth.tokenEndpoint,
          {
            grant_type: "refresh_token",
            refresh_token: decryptSecret(row.encryptedRefreshToken),
            client_id: row.oauth.clientId,
            resource: row.oauth.resource,
            ...(secret ? { client_secret: secret } : {}),
          },
          fetchImpl,
        );
      } catch (error) {
        return {
          error: error as Error,
          refused: error instanceof TokenError && error.code === "invalid_grant",
        };
      }
      await tx
        .update(schema.integration)
        .set({
          encryptedToken: encryptSecret(tokens.access_token),
          encryptedRefreshToken: tokens.refresh_token
            ? encryptSecret(tokens.refresh_token)
            : row.encryptedRefreshToken,
          expiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
        })
        .where(where);
      return { token: tokens.access_token };
    },
  );
  if ("token" in outcome) return outcome.token;
  // A refused refresh token never works again: drop the connection so Settings says so.
  if (outcome.refused) await db.delete(schema.integration).where(where);
  throw outcome.error;
}
