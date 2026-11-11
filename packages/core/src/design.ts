/**
 * Designs: the mockups of an app's screens (and its mascot) that the user approves before the
 * build. The worker writes them (a "design" run, and "mockup" runs that redraw one item); the
 * web app shows them and records approvals; the build follows the approved ones.
 */
import { and, desc, eq } from "drizzle-orm";
import type { DesignDirection, DesignView, DesignItemState } from "@appbuilder/contract";
import {
  schema,
  type Database,
  type DesignMascotRecord,
  type DesignScreenRecord,
} from "@appbuilder/db";
import { newId } from "./ids";

const { projectDesign } = schema;

export type DesignRow = typeof projectDesign.$inferSelect;

/**
 * This worker can draw mockups: an image model through OpenRouter, or the offline generator
 * (tests and demos). DESIGN_STEP=0 turns the step off. The web app learns it from the worker's
 * heartbeat (designStepAvailable), so the image key lives only on the worker.
 */
export function workerCanDesign(): boolean {
  if (process.env.DESIGN_STEP === "0") return false;
  return process.env.LLM_PROVIDER === "fake" || Boolean(process.env.OPENROUTER_API_KEY || "");
}

export class DesignError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
  }
}

/** Where a design's images live in storage. */
export function designImageKey(projectId: string, designId: string, file: string): string {
  return `projects/${projectId}/design/${designId}/${file}`;
}

export async function createDesign(
  db: Database,
  input: { projectId: string; planId: string },
): Promise<DesignRow> {
  const [row] = await db
    .insert(projectDesign)
    .values({ id: newId("dsn"), projectId: input.projectId, planId: input.planId })
    .returning();
  return row!;
}

export async function getDesign(db: Database, designId: string): Promise<DesignRow | null> {
  const [row] = await db.select().from(projectDesign).where(eq(projectDesign.id, designId));
  return row ?? null;
}

/** The newest design for a plan (a plan has at most one live design). */
export async function designForPlan(db: Database, planId: string): Promise<DesignRow | null> {
  const [row] = await db
    .select()
    .from(projectDesign)
    .where(eq(projectDesign.planId, planId))
    .orderBy(desc(projectDesign.createdAt))
    .limit(1);
  return row ?? null;
}

export async function updateDesign(
  db: Database,
  designId: string,
  patch: Partial<
    Pick<DesignRow, "status" | "direction" | "screens" | "mascot" | "error" | "costUsd">
  >,
): Promise<void> {
  await db.update(projectDesign).set(patch).where(eq(projectDesign.id, designId));
}

/** Change one screen's record (read-modify-write; only one run touches a design at a time). */
export async function patchDesignScreen(
  db: Database,
  designId: string,
  path: string,
  patch: Partial<DesignScreenRecord>,
): Promise<DesignRow> {
  const row = await getDesign(db, designId);
  if (!row) throw new DesignError("That design no longer exists.", 404);
  if (!row.screens.some((s) => s.path === path))
    throw new DesignError("That screen isn't part of this design.", 404);
  const screens = row.screens.map((s) => (s.path === path ? { ...s, ...patch } : s));
  await updateDesign(db, designId, { screens });
  return { ...row, screens };
}

export async function patchDesignMascot(
  db: Database,
  designId: string,
  patch: Partial<DesignMascotRecord>,
): Promise<DesignRow> {
  const row = await getDesign(db, designId);
  if (!row) throw new DesignError("That design no longer exists.", 404);
  if (!row.mascot) throw new DesignError("This design has no mascot.", 404);
  const mascot = { ...row.mascot, ...patch };
  await updateDesign(db, designId, { mascot });
  return { ...row, mascot };
}

/** Record an approval or a change request (no AI here: a change is redrawn by a mockup run). */
export async function reviewDesignItem(
  db: Database,
  designId: string,
  item: { path: string | "mascot"; status: Exclude<DesignItemState, "pending">; note?: string },
): Promise<DesignRow> {
  const note = (item.note ?? "").trim().slice(0, 500);
  return item.path === "mascot"
    ? patchDesignMascot(db, designId, { status: item.status, note })
    : patchDesignScreen(db, designId, item.path, { status: item.status, note });
}

export async function approveAllDesign(db: Database, designId: string): Promise<DesignRow> {
  const row = await getDesign(db, designId);
  if (!row) throw new DesignError("That design no longer exists.", 404);
  if (row.status !== "ready") throw new DesignError("The mockups are still being drawn.");
  const screens = row.screens.map((s) => ({ ...s, status: "approved" as const }));
  const mascot = row.mascot ? { ...row.mascot, status: "approved" as const } : null;
  await updateDesign(db, designId, { screens, mascot });
  return { ...row, screens, mascot };
}

export function designApproved(row: DesignRow): boolean {
  return (
    row.status === "ready" &&
    row.screens.length > 0 &&
    row.screens.every((s) => s.status === "approved" && s.image) &&
    (!row.mascot || row.mascot.status === "approved")
  );
}

/** Add to what generating the design has cost (stored as numeric). */
export async function addDesignCost(db: Database, designId: string, usd: number): Promise<void> {
  const row = await getDesign(db, designId);
  if (!row) return;
  await updateDesign(db, designId, {
    costUsd: (Number(row.costUsd) + usd).toFixed(4),
  });
}

/** What the workspace shows: the design for the project's latest plan, with image URLs. */
export function designView(row: DesignRow, imageUrl: (key: string) => string): DesignView {
  const direction = (row.direction ?? null) as DesignDirection | null;
  return {
    id: row.id,
    planId: row.planId,
    status: row.status,
    error: row.error,
    styleName: direction?.styleName ?? null,
    summary: direction?.summary ?? null,
    fonts: direction ? `${direction.typography.display} + ${direction.typography.body}` : null,
    palette: direction?.palette ?? null,
    signature: direction?.motion.signatureInteraction.name || null,
    mascot: row.mascot
      ? {
          name: row.mascot.name,
          status: row.mascot.status,
          note: row.mascot.note,
          poses: row.mascot.poses.map((p) => ({
            name: p.name,
            url: p.image ? imageUrl(p.image) : null,
          })),
        }
      : null,
    screens: row.screens.map((s) => ({
      path: s.path,
      title: s.title,
      url: s.image ? imageUrl(s.image) : null,
      status: s.status,
      note: s.note,
      version: s.version,
    })),
    approved: designApproved(row),
  };
}

/** The design shown in a project's workspace: the one for its latest plan, if any. */
export async function currentDesign(
  db: Database,
  projectId: string,
  planId: string | null,
): Promise<DesignRow | null> {
  if (!planId) return null;
  const [row] = await db
    .select()
    .from(projectDesign)
    .where(and(eq(projectDesign.projectId, projectId), eq(projectDesign.planId, planId)))
    .orderBy(desc(projectDesign.createdAt))
    .limit(1);
  return row ?? null;
}
