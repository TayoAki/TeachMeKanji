import { NextResponse } from "next/server";
import { enqueueRun, PLANS, userPlan } from "@appbuilder/core";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/native-build">) => {
    const { id } = await ctx.params;
    const { viewer, project } = await requireProject(id, "edit");
    if (!project.currentVersionId) throw new HttpError(400, "Build the app first.");
    if (!PLANS[await userPlan(db(), viewer!.id)].nativeBuilds) {
      throw new HttpError(403, "Android and iOS builds are part of the Pro plan.");
    }
    const body = await readJson<{ platform: "android" | "ios"; profile: "preview" | "production" }>(
      request,
    );
    if (
      !["android", "ios"].includes(body.platform) ||
      !["preview", "production"].includes(body.profile)
    ) {
      throw new HttpError(400, "Choose a platform and a build type.");
    }
    const run = await enqueueRun(db(), {
      projectId: id,
      userId: viewer!.id,
      kind: "native_build",
      input: body,
    });
    return NextResponse.json({ runId: run.id });
  },
);
