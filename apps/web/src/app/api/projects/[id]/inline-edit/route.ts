import { NextResponse } from "next/server";
import {
  applyInlineEdit,
  hasErrors,
  InlineEditError,
  parseFid,
  validateFile,
  type InlinePatch,
} from "@appbuilder/contract";
import { activeRun, commitVersion, fileAtVersion, getCurrentFiles } from "@appbuilder/core";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/inline-edit">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "edit");
    const body = await readJson<{ versionId: string; fid: string; patch: InlinePatch }>(request);
    if (await activeRun(db(), id)) throw new HttpError(409, "Wait for the current step to finish.");

    const { versionId, files } = await getCurrentFiles(db(), id);
    const target = parseFid(String(body.fid));
    const source = target ? files[target.path] : undefined;
    if (!versionId || !target || source === undefined) throw new HttpError(400, "Unknown element.");
    // The element's position is only valid in the file it was selected in. Other changes since
    // (a theme pick, an edit to another screen) don't matter.
    if (
      body.versionId !== versionId &&
      (await fileAtVersion(db(), id, String(body.versionId), target.path)) !== source
    ) {
      throw new HttpError(409, "The app changed since you selected this element. Select it again.");
    }

    let next: string;
    try {
      next = applyInlineEdit(source, target, body.patch ?? {});
    } catch (error) {
      if (error instanceof InlineEditError) throw new HttpError(422, error.message);
      throw error;
    }
    const issues = validateFile(target.path, next, { paths: new Set(Object.keys(files)) });
    if (hasErrors(issues))
      throw new HttpError(422, issues.find((i) => i.severity === "error")!.message);

    const version = await commitVersion(db(), {
      projectId: id,
      files: { ...files, [target.path]: next },
      kind: "inline_edit",
      summary: `Edited ${target.path.replace(/^app\//, "")} in the inspector`,
      createdBy: viewer!.id,
      // Two people editing at once: the second commit fails instead of overwriting the first.
      expectedParentId: versionId,
    });
    return NextResponse.json({ versionId: version.id, number: version.number });
  },
);
