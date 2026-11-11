import { and, eq } from "drizzle-orm";
import { canSeeSource, getStorage } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError, requireProject, route } from "@/lib/server";

const FILES = { "video.mp4": "video", "poster.jpg": "poster" } as const;

/**
 * A rendered promo video or its poster, for the project's members. Supports byte ranges, so
 * the player can seek, and `?download=1` to save the file.
 */
export const GET = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/promo/[runId]/[file]">) => {
    const { id, runId, file } = await ctx.params;
    const { access, project } = await requireProject(id);
    if (!canSeeSource(access)) throw new HttpError(404, "Not found.");
    const field = FILES[file as keyof typeof FILES];
    if (!field) throw new HttpError(404, "Not found.");
    const [run] = await db()
      .select({ output: schema.agentRun.output })
      .from(schema.agentRun)
      .where(
        and(
          eq(schema.agentRun.id, runId),
          eq(schema.agentRun.projectId, id),
          eq(schema.agentRun.kind, "promo_render"),
          eq(schema.agentRun.status, "succeeded"),
        ),
      );
    const key = (run?.output as Record<string, unknown> | null)?.[field];
    if (typeof key !== "string") throw new HttpError(404, "Not found.");
    const object = await getStorage().get(key);
    if (!object) throw new HttpError(404, "Not found.");

    const { data, contentType } = object;
    const headers = new Headers({
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      "Cache-Control": "private, max-age=3600",
    });
    if (new URL(request.url).searchParams.get("download")) {
      const format = String((run!.output as Record<string, unknown>).format ?? "video");
      const name = `${project.name.replace(/[^\w-]+/g, "-").replace(/^-|-$/g, "") || "app"}-promo-${format}.${file.split(".")[1]}`;
      headers.set("Content-Disposition", `attachment; filename="${name}"`);
    }
    const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
    if (range && (range[1] || range[2])) {
      const size = data.length;
      const start = range[1] ? Number(range[1]) : Math.max(0, size - Number(range[2]));
      const end = range[1] && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
      if (start >= size || start > end) {
        headers.set("Content-Range", `bytes */${size}`);
        return new Response(null, { status: 416, headers });
      }
      headers.set("Content-Range", `bytes ${start}-${end}/${size}`);
      headers.set("Content-Length", String(end - start + 1));
      return new Response(new Uint8Array(data.subarray(start, end + 1)), { status: 206, headers });
    }
    headers.set("Content-Length", String(data.length));
    return new Response(new Uint8Array(data), { status: 200, headers });
  },
);
