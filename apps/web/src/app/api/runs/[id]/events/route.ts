import { canSeeSource, getRun, listEvents } from "@appbuilder/core";
import { db, HttpError, requireProject, route } from "@/lib/server";

const FINAL = new Set(["done", "error", "cancelled"]);

/** Server-sent events for one run, replayed from the database (resumable with ?after=). */
export const GET = route(async (request: Request, ctx: RouteContext<"/api/runs/[id]/events">) => {
  const { id } = await ctx.params;
  const run = await getRun(db(), id);
  if (!run) throw new HttpError(404, "Run not found.");
  const { access } = await requireProject(run.projectId);
  if (!canSeeSource(access)) throw new HttpError(404, "Run not found.");

  const url = new URL(request.url);
  let after =
    Number(url.searchParams.get("after") ?? request.headers.get("last-event-id") ?? 0) || 0;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let finished = false;
      let idleTicks = 0;
      while (!request.signal.aborted && !finished) {
        const events = await listEvents(db(), id, after);
        for (const event of events) {
          after = event.id;
          controller.enqueue(
            encoder.encode(
              `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.payload)}\n\n`,
            ),
          );
          if (FINAL.has(event.type)) finished = true;
        }
        if (finished) break;
        if (events.length === 0 && ++idleTicks % 25 === 0)
          controller.enqueue(encoder.encode(": keep-alive\n\n"));
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
      controller.close();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
});
