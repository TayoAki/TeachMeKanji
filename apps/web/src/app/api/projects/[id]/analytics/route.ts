import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { ANALYTICS_CONFIG_FILE, analyticsConfigFile } from "@appbuilder/contract";
import { analyticsSummary } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { commitPlatformChange } from "@/lib/platform-change";
import { db, readJson, requireProject, route } from "@/lib/server";
import { publicAppUrl } from "@/lib/template";

/** The Analytics tab: whether it's on, and the app's usage over the last 30 days. */
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/analytics">) => {
    const { id } = await ctx.params;
    const { project } = await requireProject(id, "edit");
    return NextResponse.json({
      enabled: project.analytics,
      summary: await analyticsSummary(db(), id),
    });
  },
);

/** Turn analytics on or off: rewrites the platform-owned data/analytics-config.ts. */
export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/analytics">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "manage");
    const { enabled } = await readJson<{ enabled: boolean }>(request);
    const on = enabled === true;
    const { versionId } = await commitPlatformChange({
      projectId: id,
      userId: viewer!.id,
      summary: on ? "Turned on analytics" : "Turned off analytics",
      change: (files) => ({
        ...files,
        [ANALYTICS_CONFIG_FILE]: analyticsConfigFile({
          url: on ? publicAppUrl(request) : "",
          projectId: on ? id : "",
        }),
      }),
    });
    await db().update(schema.project).set({ analytics: on }).where(eq(schema.project.id, id));
    return NextResponse.json({ enabled: on, versionId });
  },
);
