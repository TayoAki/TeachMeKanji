import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { encryptSecret, expoAccount } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError, readJson, requireViewer, route } from "@/lib/server";

const PROVIDERS = ["github", "expo"] as const;
type Provider = (typeof PROVIDERS)[number];

async function describeToken(provider: Provider, token: string): Promise<string> {
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
  // The label is the Expo username: phone previews on iPhone need Expo Go signed in as it.
  const account = await expoAccount(token);
  if (account === null) throw new HttpError(400, "Expo rejected this token.");
  return account?.username ?? "Expo access token";
}

export const PUT = route(
  async (request: Request, ctx: RouteContext<"/api/integrations/[provider]">) => {
    const viewer = await requireViewer();
    const { provider } = await ctx.params;
    if (!PROVIDERS.includes(provider as Provider)) throw new HttpError(404, "Unknown integration.");
    const { token } = await readJson<{ token: string }>(request);
    const value = String(token ?? "").trim();
    if (value.length < 10 || value.length > 500)
      throw new HttpError(400, "That doesn't look like a valid token.");
    const label = await describeToken(provider as Provider, value);
    await db()
      .insert(schema.integration)
      .values({
        userId: viewer.id,
        provider: provider as Provider,
        encryptedToken: encryptSecret(value),
        label,
      })
      .onConflictDoUpdate({
        target: [schema.integration.userId, schema.integration.provider],
        set: { encryptedToken: encryptSecret(value), label },
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
        and(
          eq(schema.integration.userId, viewer.id),
          eq(schema.integration.provider, provider as Provider),
        ),
      );
    return NextResponse.json({ ok: true });
  },
);
