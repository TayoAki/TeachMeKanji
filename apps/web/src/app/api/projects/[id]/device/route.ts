import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { devicePreviewsAvailable } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError, requireProject, route } from "@/lib/server";

const { deviceSession, integration } = schema;

/**
 * The viewer's connected Expo account, as Settings shows it: on a physical iPhone, Expo Go only
 * opens the preview when it is signed in to that same account.
 */
async function expoAccountLabel(userId: string | undefined): Promise<string | null> {
  if (!userId) return null;
  const [row] = await db()
    .select({ label: integration.label })
    .from(integration)
    .where(and(eq(integration.userId, userId), eq(integration.provider, "expo")));
  return row ? (row.label ?? "Expo access token") : null;
}

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
    const { viewer } = await requireProject(id, "edit");
    const row = await current(id);
    if (row)
      await db()
        .update(deviceSession)
        .set({ lastSeenAt: new Date() })
        .where(eq(deviceSession.projectId, id));
    return NextResponse.json({
      session: row,
      available: await devicePreviewsAvailable(db()),
      expoAccount: await expoAccountLabel(viewer?.id),
    });
  },
);

export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/device">) => {
    const { id } = await ctx.params;
    // `restart`: start the dev server again, e.g. so it picks up a newly connected Expo account.
    const { restart } = (await request.json().catch(() => ({}))) as { restart?: boolean };
    const { project, viewer } = await requireProject(id, "edit");
    if (!project.currentVersionId) throw new HttpError(400, "Build the app first.");
    // Nothing would ever pick the session up: say so instead of spinning forever.
    if (!(await devicePreviewsAvailable(db())))
      return NextResponse.json({ session: null, available: false });
    const row = await current(id);
    // (Re)start it for this viewer: the dev server runs as their Expo account, so someone else
    // opening the dialog on a shared project restarts it as theirs.
    if (
      !row ||
      restart === true ||
      row.status === "error" ||
      row.status === "stopped" ||
      row.userId !== viewer?.id
    ) {
      const fresh = {
        status: "starting" as const,
        userId: viewer?.id ?? null,
        error: null,
        url: null,
        lastSeenAt: new Date(),
      };
      await db()
        .insert(deviceSession)
        .values({ projectId: id, ...fresh })
        .onConflictDoUpdate({ target: deviceSession.projectId, set: fresh });
    }
    return NextResponse.json({
      session: await current(id),
      available: true,
      expoAccount: await expoAccountLabel(viewer?.id),
    });
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
