import { and, eq } from "drizzle-orm";
import { getStorage, STORE_ASSET_FILE, storeAssetKey } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError, requireProject, route } from "@/lib/server";

/** An App Store asset a Store listing run made (the icon, a screenshot), to the project's editors. */
export const GET = route(
  async (
    _request: Request,
    ctx: RouteContext<"/api/projects/[id]/store-assets/[runId]/[file]">,
  ) => {
    const { id, runId, file } = await ctx.params;
    await requireProject(id, "edit");
    if (!STORE_ASSET_FILE.test(file)) throw new HttpError(404, "Not found.");
    const [run] = await db()
      .select({ id: schema.agentRun.id })
      .from(schema.agentRun)
      .where(
        and(
          eq(schema.agentRun.id, runId),
          eq(schema.agentRun.projectId, id),
          eq(schema.agentRun.kind, "store_listing"),
        ),
      );
    if (!run) throw new HttpError(404, "Not found.");
    const object = await getStorage().get(storeAssetKey(id, runId, file));
    if (!object) throw new HttpError(404, "Not found.");
    return new Response(new Uint8Array(object.data), {
      headers: {
        "Content-Type": "image/png",
        // A run's assets never change: a new listing is a new run.
        "Cache-Control": "private, max-age=31536000, immutable",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
