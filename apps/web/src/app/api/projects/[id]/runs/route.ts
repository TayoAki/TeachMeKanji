import { NextResponse } from "next/server";
import { canSeeSource, latestRuns } from "@appbuilder/core";
import { db, HttpError, requireProject, route } from "@/lib/server";

export const GET = route(async (request: Request, ctx: RouteContext<"/api/projects/[id]/runs">) => {
  const { id } = await ctx.params;
  const { access } = await requireProject(id);
  if (!canSeeSource(access)) throw new HttpError(403, "Private.");
  const kind = new URL(request.url).searchParams.get("kind");
  const runs = (await latestRuns(db(), id, 30)).filter((r) => !kind || r.kind === kind);
  return NextResponse.json({
    runs: runs.map((r) => ({
      id: r.id,
      kind: r.kind,
      status: r.status,
      output: r.output,
      error: r.error,
      creditsCharged: r.creditsCharged,
      createdAt: r.createdAt,
    })),
  });
});
