import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";

/**
 * Disconnect every AI assistant (MCP client) from an account: remove its consents and revoke
 * its refresh tokens. /api/mcp refuses tokens without a consent, so access stops at once.
 * Runs when the account changes hands: a password reset or an email verification (someone may
 * have registered the address first and connected an assistant).
 */
export async function revokeAssistantAccess(db: Database, userId: string): Promise<void> {
  await db
    .update(schema.oauthRefreshToken)
    .set({ revoked: new Date() })
    .where(
      and(eq(schema.oauthRefreshToken.userId, userId), isNull(schema.oauthRefreshToken.revoked)),
    );
  await db.delete(schema.oauthConsent).where(eq(schema.oauthConsent.userId, userId));
}
