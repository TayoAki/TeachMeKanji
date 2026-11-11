import { NextResponse } from "next/server";
import {
  activeRun,
  assertRunRate,
  currentDesign,
  enqueueRun,
  latestPlan,
  reviewDesignItem,
} from "@appbuilder/core";
import { DESIGN_LIMITS } from "@appbuilder/contract";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

/** Redraw one mockup (or the mascot, path "mascot") from the user's note. */
export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/design/redo">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "edit");
    const body = await readJson<{ path?: string; note?: string }>(request);
    const note = typeof body.note === "string" ? body.note.trim() : "";
    if (typeof body.path !== "string") throw new HttpError(400, "Say which mockup to redraw.");
    if (note.length < 3) throw new HttpError(400, "Say what should change.");
    if (note.length > DESIGN_LIMITS.noteChars)
      throw new HttpError(400, `Keep the note under ${DESIGN_LIMITS.noteChars} characters.`);
    if (await activeRun(db(), id)) throw new HttpError(409, "Wait for the current step to finish.");
    const plan = await latestPlan(db(), id);
    const design = await currentDesign(db(), id, plan?.id ?? null);
    if (!design || design.status !== "ready")
      throw new HttpError(400, "The mockups aren't ready yet.");
    await assertRunRate(db(), viewer!.id);
    await reviewDesignItem(db(), design.id, { path: body.path, status: "changes", note });
    const run = await enqueueRun(db(), {
      projectId: id,
      userId: viewer!.id,
      kind: "mockup",
      input: { designId: design.id, path: body.path },
    });
    return NextResponse.json({ runId: run.id });
  },
);
