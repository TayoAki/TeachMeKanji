import { designImageKey, getDesign, getStorage } from "@appbuilder/core";
import { db, HttpError, requireProject, route } from "@/lib/server";

/** A mockup or mascot image, to the project's members. File names carry a version, so cache. */
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/design/[designId]/[file]">) => {
    const { id, designId, file } = await ctx.params;
    await requireProject(id, "edit");
    if (!/^[a-z0-9-]+\.(png|jpg)$/i.test(file)) throw new HttpError(404, "Not found.");
    const design = await getDesign(db(), designId);
    if (!design || design.projectId !== id) throw new HttpError(404, "Not found.");
    const object = await getStorage().get(designImageKey(id, designId, file));
    if (!object) throw new HttpError(404, "Not found.");
    return new Response(new Uint8Array(object.data), {
      headers: {
        "Content-Type": file.endsWith(".png") ? "image/png" : "image/jpeg",
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
