import { NextResponse } from "next/server";
import { activeRun, assertRunRate, enqueueRun, latestPlan } from "@appbuilder/core";
import { db, HttpError, requireProject, route } from "@/lib/server";

export const POST = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/build">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "edit");
    if (await activeRun(db(), id)) throw new HttpError(409, "Wait for the current step to finish.");
    if (!(await latestPlan(db(), id))) throw new HttpError(400, "There is no plan to build yet.");
    await assertRunRate(db(), viewer!.id);
    const run = await enqueueRun(db(), { projectId: id, userId: viewer!.id, kind: "build" });
    return NextResponse.json({ runId: run.id });
  },
);
