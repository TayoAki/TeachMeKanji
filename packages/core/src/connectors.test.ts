import { createHash } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connectorById, mentionedConnectors } from "@appbuilder/contract";
import { schema, type Database } from "@appbuilder/db";
import {
  checkConnectorToken,
  completeAuthorization,
  connectorAccess,
  discoverAuthServer,
  startAuthorization,
  testConnector,
} from "./connectors";
import { encryptSecret } from "./crypto";
import { makeUser, testDb } from "./test-db";

process.env.ENCRYPTION_KEY ||= "test-key";

/**
 * A stand-in for a connector's MCP server and its OAuth server, shaped like Notion's: the
 * protected-resource metadata sits at the path-aware well-known URL, the authorization server
 * at another origin, refresh tokens rotate, and a used refresh token is refused.
 */
function mockServer() {
  const calls: Array<{ url: string; body: string }> = [];
  const codes = new Map<string, { challenge: string; resource: string }>();
  let issued = 0;
  const live = new Set<string>();
  let refreshTokens = new Set<string>();
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const body = typeof init?.body === "string" ? init.body : "";
    calls.push({ url: url.toString(), body });
    if (url.toString() === "https://mcp.example.com/.well-known/oauth-protected-resource/mcp")
      return json({
        resource: "https://mcp.example.com/mcp",
        authorization_servers: ["https://auth.example.com"],
        scopes_supported: ["read", "write"],
      });
    if (url.toString() === "https://auth.example.com/.well-known/oauth-authorization-server")
      return json({
        issuer: "https://auth.example.com",
        authorization_endpoint: "https://auth.example.com/authorize",
        token_endpoint: "https://auth.example.com/token",
        registration_endpoint: "https://auth.example.com/register",
      });
    if (url.toString() === "https://auth.example.com/register")
      return json({ client_id: `client-${calls.length}` }, 201);
    if (url.toString() === "https://auth.example.com/token") {
      const form = new URLSearchParams(body);
      if (form.get("grant_type") === "authorization_code") {
        const code = codes.get(form.get("code") ?? "");
        const verifier = form.get("code_verifier") ?? "";
        if (!code || createHash("sha256").update(verifier).digest("base64url") !== code.challenge)
          return json({ error: "invalid_grant" }, 400);
      } else if (!refreshTokens.has(form.get("refresh_token") ?? "")) {
        return json({ error: "invalid_grant", error_description: "refresh token reused" }, 400);
      }
      issued++;
      const access = `access-${issued}`;
      const refresh = `refresh-${issued}`;
      live.add(access);
      refreshTokens = new Set([refresh]); // rotation: only the newest refresh token works
      return json({ access_token: access, refresh_token: refresh, expires_in: 3600 });
    }
    if (url.toString() === "https://mcp.example.com/mcp") {
      const token = new Headers(init?.headers).get("authorization")?.replace("Bearer ", "");
      if (!token || !live.has(token)) return new Response("unauthorized", { status: 401 });
      return new Response(
        `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: 1, result: { serverInfo: { name: "Example MCP" } } })}\n\n`,
        { headers: { "content-type": "text/event-stream" } },
      );
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;
  return {
    fetchImpl,
    calls,
    /** What the user's browser does at the authorize URL: approve and come back with a code. */
    approve(authorizeUrl: string) {
      const url = new URL(authorizeUrl);
      const code = `code-${codes.size + 1}`;
      codes.set(code, {
        challenge: url.searchParams.get("code_challenge")!,
        resource: url.searchParams.get("resource")!,
      });
      return { code, state: url.searchParams.get("state")! };
    },
    issue(token: string) {
      live.add(token);
    },
  };
}

describe("connector catalog", () => {
  it("uses only the connectors a message names", () => {
    expect(mentionedConnectors("Build the paywall from my Linear issue ENG-12")).toEqual([
      "linear",
    ]);
    expect(mentionedConnectors("make the progress bar linear and fade the notion of time")).toEqual(
      [],
    );
    expect(
      mentionedConnectors("copy https://linear.app/acme/issue/ENG-1 and the mobbin flows"),
    ).toEqual(["linear", "mobbin"]);
    expect(mentionedConnectors("a jam session app")).toEqual([]);
    expect(mentionedConnectors("fix the bug in this Jam: https://jam.dev/c/123")).toEqual(["jam"]);
    expect(mentionedConnectors("prices from RevenueCat")).toEqual(["revenuecat"]);
  });
});

describe("connector sign-in", () => {
  it("finds the authorization server through the path-aware metadata", async () => {
    const server = mockServer();
    const auth = await discoverAuthServer("https://mcp.example.com/mcp", server.fetchImpl);
    expect(auth).toEqual({
      authorizationEndpoint: "https://auth.example.com/authorize",
      tokenEndpoint: "https://auth.example.com/token",
      registrationEndpoint: "https://auth.example.com/register",
      resource: "https://mcp.example.com/mcp",
      scope: "read write",
    });
  });

  it("checks a pasted token by opening an MCP session", async () => {
    const server = mockServer();
    process.env.CONNECTOR_LINEAR_URL = "https://mcp.example.com/mcp";
    const linear = connectorById("linear")!;
    expect(await checkConnectorToken(linear, "nope", server.fetchImpl)).toBeNull();
    server.issue("lin_api_good");
    expect(await checkConnectorToken(linear, "lin_api_good", server.fetchImpl)).toEqual({
      server: "Example MCP",
    });
    delete process.env.CONNECTOR_LINEAR_URL;
  });

  it("tests a connection by listing tools over a session, as server-sent events", async () => {
    const seen: Array<{ method: string; session: string | null }> = [];
    const fetchImpl = (async (_url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      const body = JSON.parse(String(init.body)) as { id?: number; method: string };
      seen.push({ method: body.method, session: headers["mcp-session-id"] ?? null });
      if (headers.authorization !== "Bearer good") return new Response("", { status: 401 });
      if (body.id === undefined) return new Response(null, { status: 202 });
      const result =
        body.method === "initialize"
          ? { serverInfo: { name: "Linear" } }
          : { tools: [{ name: "list_issues" }, { name: "get_issue" }, { name: "save_issue" }] };
      return new Response(
        `event: message\ndata: ${JSON.stringify({ jsonrpc: "2.0", id: body.id, result })}\n\n`,
        {
          status: 200,
          headers: { "content-type": "text/event-stream", "mcp-session-id": "s-1" },
        },
      );
    }) as typeof fetch;
    const access = { id: "linear" as const, name: "Linear", url: "https://mcp.example.com/mcp" };
    expect(await testConnector({ ...access, token: "good" }, fetchImpl)).toEqual({
      ok: true,
      server: "Linear",
      tools: ["list_issues", "get_issue", "save_issue"],
    });
    // Every request after initialize carries the session the server handed out.
    expect(seen.map((s) => s.session)).toEqual([null, "s-1", "s-1"]);
    expect(seen.map((s) => s.method)).toEqual([
      "initialize",
      "notifications/initialized",
      "tools/list",
    ]);
    expect(await testConnector({ ...access, token: "expired" }, fetchImpl)).toEqual({
      ok: false,
      error: "Linear rejected the connection: connect it again.",
    });
  });
});

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;
beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());

describe("connector sign-in (Postgres)", () => {
  it("registers once, signs in with PKCE, refreshes rotating tokens, and drops a dead sign-in", async () => {
    process.env.CONNECTOR_NOTION_URL = "https://mcp.example.com/mcp";
    const server = mockServer();
    const notion = connectorById("notion")!;
    const user = await makeUser(db);
    const redirectUri = "http://localhost:3000/api/connectors/callback";
    await db.delete(schema.connectorClient);

    const first = await startAuthorization({
      db,
      connector: notion,
      userId: user.id,
      redirectUri,
      returnTo: "/settings",
      fetchImpl: server.fetchImpl,
    });
    const url = new URL(first.url);
    expect(url.origin + url.pathname).toBe("https://auth.example.com/authorize");
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("resource")).toBe("https://mcp.example.com/mcp");
    expect(url.searchParams.get("redirect_uri")).toBe(redirectUri);

    // A second sign-in reuses the registered client.
    const second = await startAuthorization({
      db,
      connector: notion,
      userId: user.id,
      redirectUri,
      returnTo: "/settings",
      fetchImpl: server.fetchImpl,
    });
    expect(second.pending.clientId).toBe(first.pending.clientId);
    expect(server.calls.filter((c) => c.url.endsWith("/register"))).toHaveLength(1);

    const { code } = server.approve(first.url);
    await completeAuthorization({ db, pending: first.pending, code, fetchImpl: server.fetchImpl });

    let access = await connectorAccess(db, user.id, ["notion", "mobbin"], server.fetchImpl);
    expect(access.connectors).toEqual([
      { id: "notion", name: "Notion", url: "https://mcp.example.com/mcp", token: "access-1" },
    ]);
    expect(access.problems).toEqual([
      "Mobbin isn't connected. Connect it in Settings → Connectors and ask again to use it.",
    ]);

    // The access token is about to expire: the run gets a refreshed one, and the rotated
    // refresh token is saved for next time.
    const where = and(
      eq(schema.integration.userId, user.id),
      eq(schema.integration.provider, "notion"),
    );
    await db.update(schema.integration).set({ expiresAt: new Date() }).where(where);
    access = await connectorAccess(db, user.id, ["notion"], server.fetchImpl);
    expect(access.connectors[0]!.token).toBe("access-2");
    await db.update(schema.integration).set({ expiresAt: new Date() }).where(where);
    access = await connectorAccess(db, user.id, ["notion"], server.fetchImpl);
    expect(access.connectors[0]!.token).toBe("access-3");

    // The server refuses the refresh token (an old one, after rotation): the connection is
    // dropped, so Settings shows Notion as not connected.
    await db
      .update(schema.integration)
      .set({ expiresAt: new Date(), encryptedRefreshToken: encryptSecret("refresh-1") })
      .where(where);
    access = await connectorAccess(db, user.id, ["notion"], server.fetchImpl);
    expect(access.connectors).toEqual([]);
    expect(access.problems[0]).toMatch(
      /Notion needs you to connect it again.*refresh token reused/,
    );
    expect(await db.select().from(schema.integration).where(where)).toEqual([]);
    delete process.env.CONNECTOR_NOTION_URL;
  });
});
