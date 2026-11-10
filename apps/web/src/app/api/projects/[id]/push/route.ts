import { NextResponse } from "next/server";
import { AppCloudError, pushSummary, sendPush } from "@appbuilder/core";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

/** How many phones get the app's notifications, and what was sent (the Data tab). */
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/push">) => {
    const { id } = await ctx.params;
    await requireProject(id, "edit");
    return NextResponse.json(await pushSummary(db(), id));
  },
);

/** The owner sends a notification to everyone who allowed them. */
export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/push">) => {
    const { id } = await ctx.params;
    const { project } = await requireProject(id, "manage");
    if (project.backend !== "cloud")
      throw new HttpError(400, "Turn on App Cloud first: notifications go to its users.");
    const input = await readJson<{ title: string; body: string }>(request);
    try {
      const sent = await sendPush(db(), id, {
        title: String(input.title ?? ""),
        body: String(input.body ?? ""),
      });
      return NextResponse.json({ sent });
    } catch (error) {
      if (error instanceof AppCloudError) throw new HttpError(error.status, error.message);
      throw error;
    }
  },
);
