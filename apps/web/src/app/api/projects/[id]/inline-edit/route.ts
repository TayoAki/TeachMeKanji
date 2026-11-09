import { NextResponse } from "next/server";
import {
  applyInlineEdit,
  hasErrors,
  InlineEditError,
  parseFid,
  validateFile,
  type InlinePatch,
} from "@appbuilder/contract";
import { activeRun, commitVersion, getCurrentFiles } from "@appbuilder/core";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/inline-edit">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "edit");
    const body = await readJson<{ versionId: string; fid: string; patch: InlinePatch }>(request);
    if (await activeRun(db(), id)) throw new HttpError(409, "Wait for the current step to finish.");

    const { versionId, files } = await getCurrentFiles(db(), id);
    if (!versionId || body.versionId !== versionId) {
      throw new HttpError(409, "The app changed since you selected this element. Select it again.");
    }
    const target = parseFid(String(body.fid));
    const source = target ? files[target.path] : undefined;
    if (!target || source === undefined) throw new HttpError(400, "Unknown element.");

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
    });
    return NextResponse.json({ versionId: version.id, number: version.number });
  },
);
