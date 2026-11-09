import { randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";
import { sha256 } from "./crypto";
import { invitesNeedVerifiedEmail } from "./authz";
import { newId } from "./ids";

const { project, projectInvite, projectMember } = schema;

/** Invite links work once, for a week. */
export const INVITE_DAYS = 7;

export class InviteInvalid extends Error {
  constructor() {
    super("This invite link has expired or was already used. Ask for a new one.");
  }
}

export async function createInvite(
  db: Database,
  input: { projectId: string; role: "viewer" | "editor"; createdBy: string },
): Promise<{ token: string; expiresAt: Date }> {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + INVITE_DAYS * 86_400_000);
  await db.insert(projectInvite).values({
    id: newId("inv"),
    projectId: input.projectId,
    role: input.role,
    tokenHash: sha256(token),
    createdBy: input.createdBy,
    expiresAt,
  });
  return { token, expiresAt };
}

/** What an unused, unexpired invite is for (without using it). */
export async function peekInvite(db: Database, token: string) {
  const [row] = await db
    .select({ role: projectInvite.role, projectId: project.id, projectName: project.name })
    .from(projectInvite)
    .innerJoin(project, eq(project.id, projectInvite.projectId))
    .where(
      and(
        eq(projectInvite.tokenHash, sha256(token)),
        isNull(projectInvite.usedAt),
        gt(projectInvite.expiresAt, new Date()),
        isNull(project.deletedAt),
      ),
    );
  return row ?? null;
}

/**
 * Use an invite: the signed-in user becomes a member, bound to their account (so access needs no
 * email verification: holding the link is the proof). Each link works once.
 */
export async function acceptInvite(
  db: Database,
  token: string,
  viewer: { id: string; email: string; emailVerified?: boolean },
): Promise<{ projectId: string }> {
  return db.transaction(async (tx) => {
    const [invite] = await tx
      .update(projectInvite)
      .set({ usedAt: new Date(), usedBy: viewer.id })
      .where(
        and(
          eq(projectInvite.tokenHash, sha256(token)),
          isNull(projectInvite.usedAt),
          gt(projectInvite.expiresAt, new Date()),
        ),
      )
      .returning();
    if (!invite) throw new InviteInvalid();
    const [owner] = await tx
      .select({ ownerId: project.ownerId })
      .from(project)
      .where(and(eq(project.id, invite.projectId), isNull(project.deletedAt)));
    if (!owner) throw new InviteInvalid();
    if (owner.ownerId === viewer.id) return { projectId: invite.projectId };
    const email = viewer.email.toLowerCase();
    const [existing] = await tx
      .select({ role: projectMember.role, userId: projectMember.userId })
      .from(projectMember)
      .where(and(eq(projectMember.projectId, invite.projectId), eq(projectMember.email, email)));
    // An invite never lowers a role this account already holds. A role from an email invite
    // belongs to whoever owns that address, so only a verified (or already bound) account keeps
    // it; anyone else gets exactly what the link grants.
    const ownsExisting =
      existing?.userId === viewer.id ||
      Boolean(viewer.emailVerified) ||
      !invitesNeedVerifiedEmail();
    const role = ownsExisting && existing?.role === "editor" ? "editor" : invite.role;
    await tx
      .insert(projectMember)
      .values({
        projectId: invite.projectId,
        email,
        role,
        invitedBy: invite.createdBy,
        userId: viewer.id,
      })
      .onConflictDoUpdate({
        target: [projectMember.projectId, projectMember.email],
        set: { role, userId: viewer.id },
      });
    return { projectId: invite.projectId };
  });
}
