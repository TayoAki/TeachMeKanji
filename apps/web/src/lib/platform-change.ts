import "server-only";
import { refreshTemplate, type ProjectFiles } from "@appbuilder/contract";
import { activeRun, commitVersion, getCurrentFiles } from "@appbuilder/core";
import { db, HttpError } from "./server";
import { templateFiles } from "./template";

/**
 * Change platform-owned files (payments keys, store identifiers…) as a new version, on top of
 * the current one and the latest template. Callers check that the user may manage the project.
 */
export async function commitPlatformChange(input: {
  projectId: string;
  userId: string;
  summary: string;
  change: (files: ProjectFiles) => ProjectFiles;
}): Promise<{ versionId: string; files: ProjectFiles }> {
  if (await activeRun(db(), input.projectId))
    throw new HttpError(409, "Wait for the current step to finish.");
  const { versionId, files } = await getCurrentFiles(db(), input.projectId);
  if (!versionId) throw new HttpError(400, "Build the app first.");
  const next = input.change(refreshTemplate(files, await templateFiles()));
  const version = await commitVersion(db(), {
    projectId: input.projectId,
    files: next,
    kind: "inline_edit",
    summary: input.summary,
    createdBy: input.userId,
    expectedParentId: versionId,
  });
  return { versionId: version.id, files: next };
}
