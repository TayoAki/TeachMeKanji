import { NextResponse } from "next/server";
import { publishProject, unpublishProject } from "@appbuilder/core";
import { db, HttpError, requireProject, route } from "@/lib/server";

/** Publish the current version as a web app at /p/<slug> (re-publishing updates it). */
export const POST = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/publish">) => {
    const { id } = await ctx.params;
    const { project } = await requireProject(id, "manage");
    if (!project.currentVersionId) throw new HttpError(400, "Build the app before publishing it.");
    const slug = await publishProject(db(), project);
    return NextResponse.json({ slug, url: `/p/${slug}` });
  },
);

export const DELETE = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/publish">) => {
    const { id } = await ctx.params;
    await requireProject(id, "manage");
    await unpublishProject(db(), id);
    return NextResponse.json({ ok: true });
  },
);
