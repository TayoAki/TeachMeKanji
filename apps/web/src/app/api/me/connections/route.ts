import { and, desc, eq, isNull } from "drizzle-orm";
import { NextResponse } from "next/server";
import { schema } from "@appbuilder/db";
import { db, HttpError, requireViewer, route } from "@/lib/server";

const { oauthClient, oauthConsent, oauthRefreshToken } = schema;

/** AI assistants (MCP clients) the user has connected. */
export const GET = route(async () => {
  const viewer = await requireViewer();
  const rows = await db()
    .select({
      id: oauthConsent.id,
      clientName: oauthClient.name,
      clientUri: oauthClient.uri,
      createdAt: oauthConsent.createdAt,
    })
    .from(oauthConsent)
    .innerJoin(oauthClient, eq(oauthClient.clientId, oauthConsent.clientId))
    .where(eq(oauthConsent.userId, viewer.id))
    .orderBy(desc(oauthConsent.createdAt));
  return NextResponse.json({ connections: rows });
});

/**
 * Disconnect an assistant: remove the consent and revoke its refresh tokens. /api/mcp refuses
 * tokens without a consent, so access stops immediately, not when the last token expires.
 */
export const DELETE = route(async (request: Request) => {
  const viewer = await requireViewer();
  const id = new URL(request.url).searchParams.get("id") ?? "";
  const [consent] = await db()
    .select()
    .from(oauthConsent)
    .where(and(eq(oauthConsent.id, id), eq(oauthConsent.userId, viewer.id)));
  if (!consent) throw new HttpError(404, "Not found.");
  await db()
    .update(oauthRefreshToken)
    .set({ revoked: new Date() })
    .where(
      and(
        eq(oauthRefreshToken.clientId, consent.clientId),
        eq(oauthRefreshToken.userId, viewer.id),
        isNull(oauthRefreshToken.revoked),
      ),
    );
  await db().delete(oauthConsent).where(eq(oauthConsent.id, consent.id));
  return NextResponse.json({ ok: true });
});
