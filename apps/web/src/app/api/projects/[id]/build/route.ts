import { NextResponse } from "next/server";
import {
  activeRun,
  assertRunRate,
  currentDesign,
  designApproved,
  enqueueRun,
  latestPlan,
  RUN_CREDITS,
} from "@appbuilder/core";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/build">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "edit");
    const body = await readJson<{ skipDesign?: boolean }>(request).catch(
      () => ({}) as { skipDesign?: boolean },
    );
    if (await activeRun(db(), id)) throw new HttpError(409, "Wait for the current step to finish.");
    const plan = await latestPlan(db(), id);
    if (!plan) throw new HttpError(400, "There is no plan to build yet.");
    // With mockups, the build follows them once they're all approved (or the user skips them).
    const design = await currentDesign(db(), id, plan.id);
    if (design && !designApproved(design) && !body.skipDesign)
      throw new HttpError(
        409,
        design.status === "generating"
          ? "The mockups are still being drawn."
          : "Approve every mockup first, or build without them.",
      );
    await assertRunRate(db(), viewer!.id);
    // A build from approved mockups runs on a cheaper model, so it reserves less.
    const run = await enqueueRun(db(), {
      projectId: id,
      userId: viewer!.id,
      kind: "build",
      ...(design && designApproved(design)
        ? { reserve: RUN_CREDITS.build_from_mockups!.reserve }
        : {}),
    });
    return NextResponse.json({ runId: run.id });
  },
);
