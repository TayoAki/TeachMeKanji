import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import type { AppPlan, ProjectFiles } from "@appbuilder/contract";
import { slugify } from "@appbuilder/contract";
import { schema, type Database } from "@appbuilder/db";
import type { Project } from "./authz";
import { PLANS } from "./billing";
import { userPlan } from "./credits";
import { newId } from "./ids";
import { commitVersion, getCurrentFiles } from "./versions";

const { message, plan, project, projectMember, projectVersion, user } = schema;

export class LimitReached extends Error {}

export type Message = typeof message.$inferSelect;
export type PlanRow = typeof plan.$inferSelect;

export function nameFromPrompt(prompt: string): string {
  const cleaned = prompt
    .replace(/^(build|create|make|design)\s+(me\s+)?(an?\s+)?/i, "")
    .replace(/\s+(app|application)\b.*$/i, " app")
    .trim();
  const short = cleaned.split(/\s+/).slice(0, 5).join(" ");
  return (
    (short.charAt(0).toUpperCase() + short.slice(1)).replace(/[.,;:!?]+$/, "") || "Untitled app"
  );
}

async function assertCanCreate(db: Database, ownerId: string) {
  const planId = await userPlan(db, ownerId);
  const limit = PLANS[planId].maxProjects;
  if (limit === null) return;
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(project)
    .where(and(eq(project.ownerId, ownerId), isNull(project.deletedAt)));
  if ((row?.count ?? 0) >= limit) {
    throw new LimitReached(
      `The ${PLANS[planId].name} plan allows ${limit} projects. Upgrade to Pro for more.`,
    );
  }
}

export async function createProject(
  db: Database,
  input: { ownerId: string; prompt: string; platforms: Project["platforms"]; name?: string },
): Promise<Project> {
  await assertCanCreate(db, input.ownerId);
  const [row] = await db
    .insert(project)
    .values({
      id: newId("p"),
      ownerId: input.ownerId,
      name: input.name ?? nameFromPrompt(input.prompt),
      prompt: input.prompt,
      platforms: input.platforms,
    })
    .returning();
  return row!;
}

export async function updateProject(
  db: Database,
  projectId: string,
  patch: Partial<Pick<Project, "name" | "visibility" | "activeThemeId" | "status">>,
): Promise<void> {
  await db.update(project).set(patch).where(eq(project.id, projectId));
}

export async function deleteProject(db: Database, projectId: string): Promise<void> {
  await db
    .update(project)
    .set({ deletedAt: new Date(), publishedSlug: null, visibility: "private" })
    .where(eq(project.id, projectId));
}

export interface ProjectCard {
  id: string;
  name: string;
  status: Project["status"];
  visibility: Project["visibility"];
  updatedAt: Date;
  ownerName: string;
  activeThemeId: string | null;
  currentVersionId: string | null;
  role: "owner" | "editor" | "viewer" | "public";
}

const cardColumns = {
  id: project.id,
  name: project.name,
  status: project.status,
  visibility: project.visibility,
  updatedAt: project.updatedAt,
  ownerName: user.name,
  activeThemeId: project.activeThemeId,
  currentVersionId: project.currentVersionId,
};

export async function listProjectsFor(
  db: Database,
  viewer: { id: string; email: string },
): Promise<ProjectCard[]> {
  const own = await db
    .select(cardColumns)
    .from(project)
    .innerJoin(user, eq(user.id, project.ownerId))
    .where(and(eq(project.ownerId, viewer.id), isNull(project.deletedAt)))
    .orderBy(desc(project.updatedAt));
  const shared = await db
    .select({ ...cardColumns, role: projectMember.role })
    .from(projectMember)
    .innerJoin(project, eq(project.id, projectMember.projectId))
    .innerJoin(user, eq(user.id, project.ownerId))
    .where(and(eq(projectMember.email, viewer.email.toLowerCase()), isNull(project.deletedAt)))
    .orderBy(desc(project.updatedAt));
  return [
    ...own.map((p) => ({ ...p, role: "owner" as const })),
    ...shared.filter((s) => !own.some((o) => o.id === s.id)),
  ];
}

export async function listPublicProjects(db: Database, limit = 24): Promise<ProjectCard[]> {
  const rows = await db
    .select(cardColumns)
    .from(project)
    .innerJoin(user, eq(user.id, project.ownerId))
    .where(
      and(
        eq(project.visibility, "public"),
        isNull(project.deletedAt),
        sql`${project.currentVersionId} is not null`,
      ),
    )
    .orderBy(desc(project.updatedAt))
    .limit(limit);
  return rows.map((r) => ({ ...r, role: "public" as const }));
}

/** Copy a project's current files into a new project owned by `ownerId` ("remix"). */
/**
 * Copy a project's current files into a new project for `ownerId`. A remix of someone else's
 * public app (`includePrivate: false`) copies only what a visitor can already see: the files,
 * not the original prompt or plan.
 */
export async function duplicateProject(
  db: Database,
  source: Project,
  ownerId: string,
  options: { includePrivate: boolean } = { includePrivate: true },
): Promise<Project> {
  const copy = await createProject(db, {
    ownerId,
    prompt: options.includePrivate ? source.prompt : `Remix of “${source.name}”`,
    platforms: source.platforms,
    name: `${source.name} (${options.includePrivate ? "copy" : "remix"})`,
  });
  const { files } = await getCurrentFiles(db, source.id);
  if (Object.keys(files).length > 0) {
    await commitVersion(db, {
      projectId: copy.id,
      files,
      kind: "generate",
      summary: `Copied from “${source.name}”`,
      createdBy: ownerId,
    });
    await updateProject(db, copy.id, { status: "ready", activeThemeId: source.activeThemeId });
  }
  const sourcePlan = options.includePrivate ? await latestPlan(db, source.id) : null;
  if (sourcePlan) {
    await db.insert(plan).values({
      id: newId("pl"),
      projectId: copy.id,
      number: 1,
      data: sourcePlan.data,
      status: "confirmed",
    });
  }
  const [row] = await db.select().from(project).where(eq(project.id, copy.id));
  return row!;
}

export async function publishProject(db: Database, p: Project): Promise<string> {
  if (!p.currentVersionId) throw new Error("Build the app before publishing it");
  const slug = p.publishedSlug ?? `${slugify(p.name).slice(0, 40)}-${newId("x", 5).slice(2)}`;
  await db
    .update(project)
    .set({ publishedSlug: slug, publishedVersionId: p.currentVersionId })
    .where(eq(project.id, p.id));
  return slug;
}

export async function unpublishProject(db: Database, projectId: string): Promise<void> {
  await db
    .update(project)
    .set({ publishedSlug: null, publishedVersionId: null })
    .where(eq(project.id, projectId));
}

export async function findPublished(db: Database, slug: string): Promise<Project | null> {
  const [row] = await db
    .select()
    .from(project)
    .where(and(eq(project.publishedSlug, slug), isNull(project.deletedAt)));
  return row ?? null;
}

// --- Chat messages and plans --------------------------------------------------------------

export async function addMessage(
  db: Database,
  input: {
    projectId: string;
    role: Message["role"];
    kind?: Message["kind"];
    content: Record<string, unknown>;
    userId?: string | null;
    runId?: string | null;
  },
): Promise<Message> {
  const [row] = await db
    .insert(message)
    .values({
      id: newId("m"),
      projectId: input.projectId,
      role: input.role,
      kind: input.kind ?? "text",
      content: input.content,
      userId: input.userId ?? null,
      runId: input.runId ?? null,
    })
    .returning();
  await db.update(project).set({ updatedAt: new Date() }).where(eq(project.id, input.projectId));
  return row!;
}

export async function listMessages(db: Database, projectId: string): Promise<Message[]> {
  return db
    .select()
    .from(message)
    .where(eq(message.projectId, projectId))
    .orderBy(asc(message.createdAt), asc(message.id));
}

export async function latestPlan(db: Database, projectId: string): Promise<PlanRow | null> {
  const [row] = await db
    .select()
    .from(plan)
    .where(eq(plan.projectId, projectId))
    .orderBy(desc(plan.number))
    .limit(1);
  return row ?? null;
}

export async function savePlan(db: Database, projectId: string, data: AppPlan): Promise<PlanRow> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"plans:" + projectId}))`);
    await tx
      .update(plan)
      .set({ status: "superseded" })
      .where(and(eq(plan.projectId, projectId), eq(plan.status, "proposed")));
    const [last] = await tx
      .select({ number: plan.number })
      .from(plan)
      .where(eq(plan.projectId, projectId))
      .orderBy(desc(plan.number))
      .limit(1);
    const [row] = await tx
      .insert(plan)
      .values({
        id: newId("pl"),
        projectId,
        number: (last?.number ?? 0) + 1,
        data: data as unknown as Record<string, unknown>,
      })
      .returning();
    return row!;
  });
}

export async function confirmPlan(db: Database, planId: string): Promise<void> {
  await db.update(plan).set({ status: "confirmed" }).where(eq(plan.id, planId));
}

// --- Sharing ----------------------------------------------------------------------------

export async function shareProject(
  db: Database,
  projectId: string,
  email: string,
  role: "viewer" | "editor",
  invitedBy: string,
): Promise<void> {
  await db
    .insert(projectMember)
    .values({ projectId, email: email.trim().toLowerCase(), role, invitedBy })
    .onConflictDoUpdate({ target: [projectMember.projectId, projectMember.email], set: { role } });
}

export async function unshareProject(
  db: Database,
  projectId: string,
  email: string,
): Promise<void> {
  await db
    .delete(projectMember)
    .where(
      and(eq(projectMember.projectId, projectId), eq(projectMember.email, email.toLowerCase())),
    );
}

export async function listMembers(db: Database, projectId: string) {
  return db
    .select()
    .from(projectMember)
    .where(eq(projectMember.projectId, projectId))
    .orderBy(asc(projectMember.createdAt));
}

export async function versionCount(
  db: Database,
  projectIds: string[],
): Promise<Map<string, number>> {
  if (projectIds.length === 0) return new Map();
  const rows = await db
    .select({ projectId: projectVersion.projectId, count: sql<number>`count(*)::int` })
    .from(projectVersion)
    .where(inArray(projectVersion.projectId, projectIds))
    .groupBy(projectVersion.projectId);
  return new Map(rows.map((r) => [r.projectId, r.count]));
}

export type { ProjectFiles };
