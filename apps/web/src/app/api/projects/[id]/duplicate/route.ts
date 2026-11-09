import { NextResponse } from "next/server";
import { duplicateProject } from "@appbuilder/core";
import { db, HttpError, requireProject, route } from "@/lib/server";

/** Duplicate your own project, or remix a public one into your account. */
export const POST = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/duplicate">) => {
    const { id } = await ctx.params;
    const { project, viewer } = await requireProject(id);
    if (!viewer) throw new HttpError(401, "Sign in to remix this app.");
    const copy = await duplicateProject(db(), project, viewer.id);
    return NextResponse.json({ id: copy.id });
  },
);
