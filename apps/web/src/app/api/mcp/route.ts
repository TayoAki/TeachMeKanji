import { and, eq } from "drizzle-orm";
import { requireMcpAuth } from "@better-auth/mcp";
import { createMcpHandler } from "@modelcontextprotocol/server";
import { reportError } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { auth, MCP_RESOURCE } from "@/lib/auth";
import { buildMcpServer } from "@/lib/mcp-tools";
import { db } from "@/lib/server";

/**
 * The MCP endpoint (Streamable HTTP). Clients sign in with OAuth (this app is the
 * authorization server); every request carries an access token bound to MCP_RESOURCE, and each
 * request gets a server instance acting as that token's user. Both the 2026-07-28 protocol and
 * 2025-era clients are served, statelessly.
 */
const mcp = createMcpHandler(
  (ctx) => {
    const extra = ctx.authInfo?.extra as { userId?: string; clientName?: string } | undefined;
    if (!extra?.userId) throw new Error("MCP request without a verified user");
    return buildMcpServer(extra.userId, extra.clientName ?? "an AI assistant");
  },
  { legacy: "stateless", onerror: (error) => reportError(error, { where: "mcp" }) },
);

async function userExists(id: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: schema.user.id })
    .from(schema.user)
    .where(eq(schema.user.id, id));
  return Boolean(row);
}

async function hasConsent(clientId: string, userId: string): Promise<boolean> {
  const [row] = await db()
    .select({ id: schema.oauthConsent.id })
    .from(schema.oauthConsent)
    .where(and(eq(schema.oauthConsent.clientId, clientId), eq(schema.oauthConsent.userId, userId)));
  return Boolean(row);
}

async function clientName(clientId: string): Promise<string | undefined> {
  const [row] = await db()
    .select({ name: schema.oauthClient.name })
    .from(schema.oauthClient)
    .where(eq(schema.oauthClient.clientId, clientId));
  return row?.name ?? undefined;
}

export const POST = requireMcpAuth(
  auth,
  async (request, claims) => {
    const clientId = typeof claims.azp === "string" ? claims.azp : "";
    // Only tokens a user approved act here (never client-credentials tokens).
    if (typeof claims.sub !== "string" || !(await userExists(claims.sub))) {
      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "Sign in as a user to use this server." },
          id: null,
        },
        { status: 403 },
      );
    }
    // Disconnecting an assistant in Settings deletes its consent: stop at once, even though
    // its access token (a signed JWT) would otherwise stay valid until it expires.
    if (!(await hasConsent(clientId, claims.sub))) {
      return Response.json(
        {
          jsonrpc: "2.0",
          error: { code: -32001, message: "This connection was removed. Connect again." },
          id: null,
        },
        {
          status: 401,
          headers: {
            "WWW-Authenticate": `Bearer error="invalid_token", resource_metadata="${new URL(MCP_RESOURCE).origin}/.well-known/oauth-protected-resource${new URL(MCP_RESOURCE).pathname}"`,
          },
        },
      );
    }
    return mcp.fetch(request, {
      authInfo: {
        token: "",
        clientId,
        scopes: typeof claims.scope === "string" ? claims.scope.split(" ").filter(Boolean) : [],
        expiresAt: claims.exp,
        extra: { userId: claims.sub, clientName: await clientName(clientId) },
      },
    });
  },
  { resource: MCP_RESOURCE },
);
