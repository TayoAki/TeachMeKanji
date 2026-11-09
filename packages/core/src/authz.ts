import { and, eq, isNull } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";

const { project, projectMember } = schema;

export type Project = typeof project.$inferSelect;
export type Access = "owner" | "editor" | "viewer" | "public";

export interface Viewer {
  id: string;
  email: string;
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
    if (member) return { project: row, access: member.role };
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
