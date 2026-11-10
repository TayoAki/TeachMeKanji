import { NextResponse } from "next/server";
import { assertRunRate, enqueueRun } from "@appbuilder/core";
import { db, HttpError, requireProject, route } from "@/lib/server";

/** Write the App Store / Google Play listing (a store_listing run). */
export const POST = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/store-listing">) => {
    const { id } = await ctx.params;
    const { viewer, project } = await requireProject(id, "edit");
    if (!project.currentVersionId) throw new HttpError(400, "Build the app first.");
    await assertRunRate(db(), viewer!.id);
    const run = await enqueueRun(db(), {
      projectId: id,
      userId: viewer!.id,
      kind: "store_listing",
      input: {},
    });
    return NextResponse.json({ runId: run.id });
  },
);
