import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { reviewCheck } from "@appbuilder/contract";
import { getCurrentFiles, openErrorCounts } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError, requireProject, route } from "@/lib/server";

/** The App Review check for the current version, before it goes to a store. */
export const GET = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/review-check">) => {
    const { id } = await ctx.params;
    await requireProject(id, "edit");
    const platform =
      new URL(request.url).searchParams.get("platform") === "android" ? "android" : "ios";
    const { versionId, files } = await getCurrentFiles(db(), id);
    if (!versionId) throw new HttpError(400, "Build the app first.");
    const errors = await openErrorCounts(db(), id);
    const [listing] = await db()
      .select({ id: schema.agentRun.id })
      .from(schema.agentRun)
      .where(
        and(
          eq(schema.agentRun.projectId, id),
          eq(schema.agentRun.kind, "store_listing"),
          eq(schema.agentRun.status, "succeeded"),
        ),
      )
      .limit(1);
    return NextResponse.json(
      reviewCheck(files, {
        platform,
        openCrashes: errors.crashes,
        openErrors: errors.errors,
        hasListing: Boolean(listing),
      }),
    );
  },
);
