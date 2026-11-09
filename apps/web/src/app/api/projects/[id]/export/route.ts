import JSZip from "jszip";
import { canSeeSource, exportBundle, getCurrentFiles } from "@appbuilder/core";
import { slugify } from "@appbuilder/contract";
import { db, HttpError, requireProject, route } from "@/lib/server";

export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/export">) => {
    const { id } = await ctx.params;
    const { project, access } = await requireProject(id);
    if (!canSeeSource(access))
      throw new HttpError(403, "Only collaborators can download the source.");
    const { versionId, files } = await getCurrentFiles(db(), id);
    if (!versionId) throw new HttpError(400, "Build the app before downloading it.");

    const zip = new JSZip();
    const folder = zip.folder(slugify(project.name))!;
    for (const [path, content] of Object.entries(exportBundle(project.name, files)))
      folder.file(path, content);
    const data = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
    return new Response(data as BodyInit, {
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${slugify(project.name)}.zip"`,
      },
    });
  },
);
