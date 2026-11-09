import { and, eq, isNull } from "drizzle-orm";
import { getStorage } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db } from "@/lib/server";

/**
 * Images added to an app (add_image). They ship inside the app (previews, published web apps,
 * phone builds), so they're public by unguessable id; private prompt images are never served here.
 */
export async function GET(_request: Request, ctx: RouteContext<"/api/app-images/[id]">) {
  const { id } = await ctx.params;
  const [row] = await db()
    .select({ asset: schema.projectAsset })
    .from(schema.projectAsset)
    .innerJoin(schema.project, eq(schema.project.id, schema.projectAsset.projectId))
    .where(
      and(
        eq(schema.projectAsset.id, id),
        eq(schema.projectAsset.purpose, "app_image"),
        // A deleted project's images stop being served.
        isNull(schema.project.deletedAt),
      ),
    );
  const asset = row?.asset;
  const object = asset ? await getStorage().get(asset.storageKey) : null;
  if (!asset || !object) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(object.data), {
    headers: {
      "Content-Type": asset.mime,
      "Cache-Control": "public, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'",
      "Access-Control-Allow-Origin": "*",
      "Cross-Origin-Resource-Policy": "cross-origin",
    },
  });
}
