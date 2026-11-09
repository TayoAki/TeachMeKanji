import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { devicePreviewsAvailable } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError, requireProject, route } from "@/lib/server";

const { deviceSession } = schema;

async function current(projectId: string) {
  const [row] = await db()
    .select()
    .from(deviceSession)
    .where(eq(deviceSession.projectId, projectId));
  return row ?? null;
}

/**
 * Status of the project's on-device preview; polling it also keeps the dev server alive.
 * `available` is false when no worker runs phone previews (DEVICE_PREVIEW_ENABLED=0 everywhere).
 */
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/device">) => {
    const { id } = await ctx.params;
    await requireProject(id, "edit");
    const row = await current(id);
    if (row)
      await db()
        .update(deviceSession)
        .set({ lastSeenAt: new Date() })
        .where(eq(deviceSession.projectId, id));
    return NextResponse.json({ session: row, available: await devicePreviewsAvailable(db()) });
  },
);

export const POST = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/device">) => {
    const { id } = await ctx.params;
    const { project } = await requireProject(id, "edit");
    if (!project.currentVersionId) throw new HttpError(400, "Build the app first.");
    // Nothing would ever pick the session up: say so instead of spinning forever.
    if (!(await devicePreviewsAvailable(db())))
      return NextResponse.json({ session: null, available: false });
    const row = await current(id);
    if (!row || row.status === "error" || row.status === "stopped") {
      await db()
        .insert(deviceSession)
        .values({ projectId: id, status: "starting", lastSeenAt: new Date() })
        .onConflictDoUpdate({
          target: deviceSession.projectId,
          set: { status: "starting", error: null, url: null, lastSeenAt: new Date() },
        });
    }
    return NextResponse.json({ session: await current(id), available: true });
  },
);

export const DELETE = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/device">) => {
    const { id } = await ctx.params;
    await requireProject(id, "edit");
    await db()
      .update(deviceSession)
      .set({ status: "stopped" })
      .where(eq(deviceSession.projectId, id));
    return NextResponse.json({ ok: true });
  },
);
