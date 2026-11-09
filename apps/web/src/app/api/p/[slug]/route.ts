import { NextResponse } from "next/server";
import { findPublished, getVersionFiles } from "@appbuilder/core";
import { db, HttpError, route } from "@/lib/server";

/** Files of a published app (the published snapshot, not the working copy). */
export const GET = route(async (_request: Request, ctx: RouteContext<"/api/p/[slug]">) => {
  const { slug } = await ctx.params;
  const project = await findPublished(db(), slug);
  if (!project?.publishedVersionId) throw new HttpError(404, "This app isn't published.");
  return NextResponse.json({
    name: project.name,
    projectId: project.id,
    themeId: project.activeThemeId,
    files: await getVersionFiles(db(), project.publishedVersionId),
  });
});
