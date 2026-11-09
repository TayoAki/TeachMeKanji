import { eq } from "drizzle-orm";
import { canSeeSource, getStorage } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError, requireProject, route } from "@/lib/server";

export const GET = route(async (_request: Request, ctx: RouteContext<"/api/assets/[id]">) => {
  const { id } = await ctx.params;
  const [asset] = await db()
    .select()
    .from(schema.projectAsset)
    .where(eq(schema.projectAsset.id, id));
  if (!asset) throw new HttpError(404, "Not found.");
  const { access } = await requireProject(asset.projectId);
  if (!canSeeSource(access)) throw new HttpError(404, "Not found.");
  const object = await getStorage().get(asset.storageKey);
  if (!object) throw new HttpError(404, "Not found.");
  return new Response(new Uint8Array(object.data), {
    headers: {
      "Content-Type": asset.mime,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    },
  });
});
