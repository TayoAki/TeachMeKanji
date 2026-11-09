import { NextResponse } from "next/server";
import { backendConfigFile, readPlatformConfig, refreshTemplate } from "@appbuilder/contract";
import { activeRun, commitVersion, getCurrentFiles } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { eq } from "drizzle-orm";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";
import { publicAppUrl, templateFiles } from "@/lib/template";

/** Turn App Cloud on or off: the app's data moves between the device and the platform. */
export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/backend">) => {
    const { id } = await ctx.params;
    const { project, viewer } = await requireProject(id, "manage");
    const { enabled } = await readJson<{ enabled: boolean }>(request);
    if (await activeRun(db(), id)) throw new HttpError(409, "Wait for the current step to finish.");
    const { versionId, files } = await getCurrentFiles(db(), id);
    if (!versionId) throw new HttpError(400, "Build the app first.");

    const current = readPlatformConfig(files);
    const next = refreshTemplate(files, await templateFiles());
    next["data/backend.ts"] = backendConfigFile({
      apiUrl: enabled ? publicAppUrl(request) : "",
      projectId: project.id,
      imageEndpoint: current.imageEndpoint || process.env.IMAGEKIT_URL_ENDPOINT || "",
    });
    await db()
      .update(schema.project)
      .set({ backend: enabled ? "cloud" : "local" })
      .where(eq(schema.project.id, id));
    const version = await commitVersion(db(), {
      projectId: id,
      files: next,
      kind: "ai_edit",
      summary: enabled
        ? "Connected App Cloud"
        : "Disconnected App Cloud (data stays on the device)",
      createdBy: viewer!.id,
      expectedParentId: versionId,
    });
    return NextResponse.json({ backend: enabled ? "cloud" : "local", versionId: version.id });
  },
);
