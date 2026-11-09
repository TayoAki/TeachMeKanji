import { NextResponse } from "next/server";
import { canSeeSource, listVersions } from "@appbuilder/core";
import { db, HttpError, requireProject, route } from "@/lib/server";

export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/versions">) => {
    const { id } = await ctx.params;
    const { access, project } = await requireProject(id);
    if (!canSeeSource(access)) throw new HttpError(403, "History is private.");
    const versions = await listVersions(db(), id);
    return NextResponse.json({
      currentVersionId: project.currentVersionId,
      versions: versions.map((v) => ({
        id: v.id,
        number: v.number,
        kind: v.kind,
        summary: v.summary,
        createdAt: v.createdAt,
      })),
    });
  },
);
