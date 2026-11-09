import { NextResponse } from "next/server";
import { appDataSummary, clearAppData } from "@appbuilder/core";
import { db, requireProject, route } from "@/lib/server";

/** App Cloud data for the project owner and editors (the workspace's Data tab). */
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/data">) => {
    const { id } = await ctx.params;
    const { project } = await requireProject(id, "edit");
    return NextResponse.json({ backend: project.backend, ...(await appDataSummary(db(), id)) });
  },
);

export const DELETE = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/data">) => {
    const { id } = await ctx.params;
    await requireProject(id, "manage");
    await clearAppData(db(), id);
    return NextResponse.json({ ok: true });
  },
);
