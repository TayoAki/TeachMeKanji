import { NextResponse } from "next/server";
import { previewSession } from "@appbuilder/core";
import { db, requireProject, route } from "@/lib/server";

/** A session for the workspace preview's stable test user, so preview data persists. */
export const POST = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/preview-token">) => {
    const { id } = await ctx.params;
    const { project } = await requireProject(id, "edit");
    if (project.backend !== "cloud") return NextResponse.json({ token: null });
    return NextResponse.json({ token: await previewSession(db(), id) });
  },
);
