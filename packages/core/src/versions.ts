import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { BACKEND_CONFIG_FILE, type ProjectFiles } from "@appbuilder/contract";
import { schema, type Database } from "@appbuilder/db";
import { sha256 } from "./crypto";
import { newId } from "./ids";

const { blob, project, projectVersion, versionFile } = schema;

export type Version = typeof projectVersion.$inferSelect;

export class VersionConflict extends Error {
  constructor() {
    super("The app changed since you started this edit. Select the element again.");
  }
}

/**
 * Commit a full snapshot of a project's files as a new immutable version and make it current.
 * Files are stored content-addressed, so unchanged files cost nothing.
 */
export async function commitVersion(
  db: Database,
  input: {
    projectId: string;
    files: ProjectFiles;
    kind: Version["kind"];
    summary: string;
    runId?: string;
    createdBy?: string;
    /** If set, commit only if this is still the project's current version. */
    expectedParentId?: string;
  },
): Promise<Version> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${"versions:" + input.projectId}))`);

    const entries = Object.entries(input.files).map(([path, content]) => ({
      path,
      content,
      hash: sha256(content),
    }));
    if (entries.length > 0) {
      await tx
        .insert(blob)
        .values(
          entries.map((e) => ({
            hash: e.hash,
            content: e.content,
            bytes: Buffer.byteLength(e.content),
          })),
        )
        .onConflictDoNothing();
    }

    const [current] = await tx
      .select({ currentVersionId: project.currentVersionId })
      .from(project)
      .where(eq(project.id, input.projectId));
    if (
      input.expectedParentId !== undefined &&
      current?.currentVersionId !== input.expectedParentId
    ) {
      throw new VersionConflict();
    }
    const [last] = await tx
      .select({ number: projectVersion.number })
      .from(projectVersion)
      .where(eq(projectVersion.projectId, input.projectId))
      .orderBy(desc(projectVersion.number))
      .limit(1);

    const [version] = await tx
      .insert(projectVersion)
      .values({
        id: newId("v"),
        projectId: input.projectId,
        number: (last?.number ?? 0) + 1,
        parentId: current?.currentVersionId ?? null,
        runId: input.runId,
        kind: input.kind,
        summary: input.summary,
        createdBy: input.createdBy,
      })
      .returning();

    if (entries.length > 0) {
      await tx
        .insert(versionFile)
        .values(entries.map((e) => ({ versionId: version!.id, path: e.path, blobHash: e.hash })));
    }
    await tx
      .update(project)
      .set({ currentVersionId: version!.id })
      .where(eq(project.id, input.projectId));
    return version!;
  });
}

export async function getVersionFiles(db: Database, versionId: string): Promise<ProjectFiles> {
  const rows = await db
    .select({ path: versionFile.path, content: blob.content })
    .from(versionFile)
    .innerJoin(blob, eq(blob.hash, versionFile.blobHash))
    .where(eq(versionFile.versionId, versionId))
    .orderBy(asc(versionFile.path));
  return Object.fromEntries(rows.map((r) => [r.path, r.content]));
}

/** One file as it was in one of the project's versions (undefined if there's no such file). */
export async function fileAtVersion(
  db: Database,
  projectId: string,
  versionId: string,
  path: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ content: blob.content })
    .from(versionFile)
    .innerJoin(projectVersion, eq(projectVersion.id, versionFile.versionId))
    .innerJoin(blob, eq(blob.hash, versionFile.blobHash))
    .where(
      and(
        eq(versionFile.versionId, versionId),
        eq(projectVersion.projectId, projectId),
        eq(versionFile.path, path),
      ),
    );
  return row?.content;
}

export async function getCurrentFiles(
  db: Database,
  projectId: string,
): Promise<{ versionId: string | null; files: ProjectFiles }> {
  const [row] = await db
    .select({ v: project.currentVersionId })
    .from(project)
    .where(eq(project.id, projectId));
  if (!row?.v) return { versionId: null, files: {} };
  return { versionId: row.v, files: await getVersionFiles(db, row.v) };
}

export async function listVersions(db: Database, projectId: string): Promise<Version[]> {
  return db
    .select()
    .from(projectVersion)
    .where(eq(projectVersion.projectId, projectId))
    .orderBy(desc(projectVersion.number));
}

/** Restore = a new version whose files equal an older one (history stays linear). */
export async function restoreVersion(
  db: Database,
  projectId: string,
  versionId: string,
  userId: string,
): Promise<Version> {
  const [target] = await db.select().from(projectVersion).where(eq(projectVersion.id, versionId));
  if (!target || target.projectId !== projectId) throw new Error("Version not found");
  const files = await getVersionFiles(db, versionId);
  // Platform settings (App Cloud, image endpoint) belong to the project, not to a version.
  const current = await getCurrentFiles(db, projectId);
  const config = current.files[BACKEND_CONFIG_FILE];
  if (config !== undefined) files[BACKEND_CONFIG_FILE] = config;
  return commitVersion(db, {
    projectId,
    files,
    kind: "restore",
    summary: `Restored version ${target.number}`,
    createdBy: userId,
  });
}

/** Changed paths between two file sets (for summaries and live device updates). */
export function diffFiles(before: ProjectFiles, after: ProjectFiles) {
  const added = Object.keys(after).filter((p) => !(p in before));
  const removed = Object.keys(before).filter((p) => !(p in after));
  const changed = Object.keys(after).filter((p) => p in before && before[p] !== after[p]);
  return { added, removed, changed };
}

export async function versionNumbers(db: Database, ids: string[]): Promise<Map<string, number>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({ id: projectVersion.id, number: projectVersion.number })
    .from(projectVersion)
    .where(inArray(projectVersion.id, ids));
  return new Map(rows.map((r) => [r.id, r.number]));
}
