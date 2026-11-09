import { NextResponse } from "next/server";
import { assertProjectRate, canSeeSource, duplicateProject } from "@appbuilder/core";
import { db, HttpError, requireProject, route } from "@/lib/server";

/** Duplicate your own project, or remix a public one into your account. */
export const POST = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/duplicate">) => {
    const { id } = await ctx.params;
    const { project, viewer, access } = await requireProject(id);
    if (!viewer) throw new HttpError(401, "Sign in to remix this app.");
    await assertProjectRate(db(), viewer.id);
    const copy = await duplicateProject(db(), project, viewer.id, {
      includePrivate: canSeeSource(access),
    });
    return NextResponse.json({ id: copy.id });
  },
);
