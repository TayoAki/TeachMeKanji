import "server-only";
import { eq } from "drizzle-orm";
import { backendConfigFile, readPlatformConfig, refreshTemplate } from "@appbuilder/contract";
import { activeRun, commitVersion, getCurrentFiles, type Project } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError } from "./server";
import { templateFiles } from "./template";

/**
 * Turn App Cloud on or off: rewrites the platform-owned data/backend.ts as a new version, so the
 * app's data moves between the device and the platform. Callers check that the user may manage
 * the project.
 */
export async function setAppCloud(input: {
  project: Project;
  userId: string;
  enabled: boolean;
  /** The origin generated apps call (APP_PUBLIC_URL or the request's origin). */
  apiOrigin: string;
}): Promise<{ backend: "cloud" | "local"; versionId: string }> {
  const { project, enabled } = input;
  if (await activeRun(db(), project.id)) {
    throw new HttpError(409, "Wait for the current step to finish.");
  }
  const { versionId, files } = await getCurrentFiles(db(), project.id);
  if (!versionId) throw new HttpError(400, "Build the app first.");

  const current = readPlatformConfig(files);
  const next = refreshTemplate(files, await templateFiles());
  next["data/backend.ts"] = backendConfigFile({
    apiUrl: enabled ? input.apiOrigin : "",
    projectId: project.id,
    imageEndpoint: current.imageEndpoint || process.env.IMAGEKIT_URL_ENDPOINT || "",
  });
  await db()
    .update(schema.project)
    .set({ backend: enabled ? "cloud" : "local" })
    .where(eq(schema.project.id, project.id));
  const version = await commitVersion(db(), {
    projectId: project.id,
    files: next,
    kind: "ai_edit",
    summary: enabled ? "Connected App Cloud" : "Disconnected App Cloud (data stays on the device)",
    createdBy: input.userId,
    expectedParentId: versionId,
  });
  return { backend: enabled ? "cloud" : "local", versionId: version.id };
}
