import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { connectorById } from "@appbuilder/contract";
import { checkConnectorToken, encryptSecret, expoAccount } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError, readJson, requireViewer, route } from "@/lib/server";

/** Expo, plus every connector that takes a pasted token (GitHub's also exports apps). */
function knownProvider(provider: string): boolean {
  return provider === "expo" || Boolean(connectorById(provider)?.token);
}

async function describeToken(provider: string, token: string): Promise<string> {
  if (provider === "github") {
    const response = await fetch("https://api.github.com/user", {
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": "app-builder",
        Accept: "application/vnd.github+json",
      },
    }).catch(() => null);
    if (response && response.status === 401)
      throw new HttpError(400, "GitHub rejected this token.");
    const login = response?.ok ? ((await response.json()) as { login?: string }).login : undefined;
    return login ? `@${login}` : "GitHub token";
  }
  if (provider === "expo") {
    // The label is the Expo username: phone previews on iPhone need Expo Go signed in as it.
    const account = await expoAccount(token);
    if (account === null) throw new HttpError(400, "Expo rejected this token.");
    return account?.username ?? "Expo access token";
  }
  // Other connectors: open an MCP session with the token to see that the server takes it.
  const connector = connectorById(provider)!;
  const checked = await checkConnectorToken(connector, token);
  if (checked === null) throw new HttpError(400, `${connector.name} rejected this token.`);
  return connector.token!.label;
}

export const PUT = route(
  async (request: Request, ctx: RouteContext<"/api/integrations/[provider]">) => {
    const viewer = await requireViewer();
    const { provider } = await ctx.params;
    if (!knownProvider(provider)) throw new HttpError(404, "Unknown integration.");
    const { token } = await readJson<{ token: string }>(request);
    const value = String(token ?? "").trim();
    if (value.length < 10 || value.length > 500)
      throw new HttpError(400, "That doesn't look like a valid token.");
    const label = await describeToken(provider, value);
    await db()
      .insert(schema.integration)
      .values({
        userId: viewer.id,
        provider,
        encryptedToken: encryptSecret(value),
        label,
      })
      .onConflictDoUpdate({
        target: [schema.integration.userId, schema.integration.provider],
        // A pasted token replaces a sign-in.
        set: {
          encryptedToken: encryptSecret(value),
          label,
          auth: "token",
          encryptedRefreshToken: null,
          expiresAt: null,
          oauth: null,
        },
      });
    return NextResponse.json({ ok: true, label });
  },
);

export const DELETE = route(
  async (_request: Request, ctx: RouteContext<"/api/integrations/[provider]">) => {
    const viewer = await requireViewer();
    const { provider } = await ctx.params;
    await db()
      .delete(schema.integration)
      .where(
        and(eq(schema.integration.userId, viewer.id), eq(schema.integration.provider, provider)),
      );
    return NextResponse.json({ ok: true });
  },
);
