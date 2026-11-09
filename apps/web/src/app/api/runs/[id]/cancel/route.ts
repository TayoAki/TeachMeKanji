import { NextResponse } from "next/server";
import { getRun, requestCancel } from "@appbuilder/core";
import { db, HttpError, requireProject, route } from "@/lib/server";

export const POST = route(async (_request: Request, ctx: RouteContext<"/api/runs/[id]/cancel">) => {
  const { id } = await ctx.params;
  const run = await getRun(db(), id);
  if (!run) throw new HttpError(404, "Run not found.");
  await requireProject(run.projectId, "edit");
  await requestCancel(db(), id);
  return NextResponse.json({ ok: true });
});
