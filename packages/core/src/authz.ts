import { createHash, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";

const { project, projectMember } = schema;

export type Project = typeof project.$inferSelect;
export type Access = "owner" | "editor" | "viewer" | "public";

export interface Viewer {
  id: string;
  email: string;
  /** Sharing is by email, so access through an invite needs a verified address. */
  emailVerified?: boolean;
}

/** On in production (or with REQUIRE_VERIFIED_EMAIL=1); REQUIRE_VERIFIED_EMAIL=0 turns it off. */
export function invitesNeedVerifiedEmail(): boolean {
  if (process.env.REQUIRE_VERIFIED_EMAIL === "0") return false;
  return process.env.NODE_ENV === "production" || process.env.REQUIRE_VERIFIED_EMAIL === "1";
}

/**
 * The one place that decides who can see or change a project. Every API route and page goes
 * through this; "not found" and "no access" look the same to the caller.
 */
export async function projectAccess(
  db: Database,
  projectId: string,
  viewer: Viewer | null,
): Promise<{ project: Project; access: Access } | null> {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.id, projectId), isNull(project.deletedAt)));
  if (!row) return null;
  if (viewer && row.ownerId === viewer.id) return { project: row, access: "owner" };
  if (viewer) {
    const [member] = await db
      .select()
      .from(projectMember)
      .where(
        and(
          eq(projectMember.projectId, projectId),
          eq(projectMember.email, viewer.email.toLowerCase()),
        ),
      );
    // An email invite needs a verified address (anyone can sign up with any email); a
    // membership accepted through an invite link is bound to the account that accepted it.
    const trusted =
      member &&
      (member.userId === viewer.id || viewer.emailVerified || !invitesNeedVerifiedEmail());
    if (trusted) return { project: row, access: member.role };
  }
  if (row.visibility === "public") return { project: row, access: "public" };
  return null;
}

export function canEdit(access: Access): boolean {
  return access === "owner" || access === "editor";
}

export function canManage(access: Access): boolean {
  return access === "owner";
}

/** Who may see the chat, code and history (public visitors only see the running app). */
export function canSeeSource(access: Access): boolean {
  return access !== "public";
}

/**
 * Operator actions (granting credits) authenticate with ADMIN_API_TOKEN, not a user session.
 * Unset, or shorter than 32 characters, turns them off.
 */
export function isAdminToken(authorization: string | null): boolean {
  const expected = process.env.ADMIN_API_TOKEN || "";
  if (expected.length < 32 || !authorization?.startsWith("Bearer ")) return false;
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(authorization.slice(7)), digest(expected));
}
