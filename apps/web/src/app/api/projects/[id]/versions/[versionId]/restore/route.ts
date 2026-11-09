import { NextResponse } from "next/server";
import { activeRun, restoreVersion } from "@appbuilder/core";
import { db, HttpError, requireProject, route } from "@/lib/server";

export const POST = route(
  async (
    _request: Request,
    ctx: RouteContext<"/api/projects/[id]/versions/[versionId]/restore">,
  ) => {
    const { id, versionId } = await ctx.params;
    const { viewer } = await requireProject(id, "edit");
    if (await activeRun(db(), id)) throw new HttpError(409, "Wait for the current step to finish.");
    try {
      const version = await restoreVersion(db(), id, versionId, viewer!.id);
      return NextResponse.json({ versionId: version.id, number: version.number });
    } catch {
      throw new HttpError(404, "Version not found.");
    }
  },
);
