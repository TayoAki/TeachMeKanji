import { NextResponse } from "next/server";
import { enqueueRun } from "@appbuilder/core";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

/**
 * Submit the app's version for App Review in App Store Connect, optionally as a pre-order with
 * its release date (the worker checks the date and everything Apple needs).
 */
export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/store-submit">) => {
    const { id } = await ctx.params;
    const { viewer, project } = await requireProject(id, "manage");
    if (!project.currentVersionId) throw new HttpError(400, "Build the app first.");
    const body = await readJson<{ preOrderDate?: string | null }>(request);
    const preOrderDate = String(body.preOrderDate ?? "").trim() || null;
    if (preOrderDate && !/^\d{4}-\d{2}-\d{2}$/.test(preOrderDate))
      throw new HttpError(400, "Pick the release date.");
    const run = await enqueueRun(db(), {
      projectId: id,
      userId: viewer!.id,
      kind: "store_submit",
      input: { preOrderDate },
    });
    return NextResponse.json({ runId: run.id });
  },
);
