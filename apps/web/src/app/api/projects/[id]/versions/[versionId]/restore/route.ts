import { NextResponse } from "next/server";
import { activeRun, getCurrentFiles, restoreVersion, settleUndo } from "@appbuilder/core";
import { db, HttpError, requireProject, route } from "@/lib/server";

export const POST = route(
  async (
    _request: Request,
    ctx: RouteContext<"/api/projects/[id]/versions/[versionId]/restore">,
  ) => {
    const { id, versionId } = await ctx.params;
    const { viewer } = await requireProject(id, "edit");
    if (await activeRun(db(), id)) throw new HttpError(409, "Wait for the current step to finish.");
    const before = await getCurrentFiles(db(), id);
    let version;
    try {
      version = await restoreVersion(db(), id, versionId, viewer!.id);
    } catch {
      throw new HttpError(404, "Version not found.");
    }
    // Undoing a recent AI edit gives its credits back.
    const credits = await settleUndo(db(), {
      projectId: id,
      fromVersionId: before.versionId,
      toVersionId: versionId,
    });
    return NextResponse.json({ versionId: version.id, number: version.number, ...credits });
  },
);
