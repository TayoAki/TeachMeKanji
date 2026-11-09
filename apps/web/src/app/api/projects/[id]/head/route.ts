import { NextResponse } from "next/server";
import { db, requireProject, route } from "@/lib/server";
import { schema } from "@appbuilder/db";
import { eq } from "drizzle-orm";

/** The project's current version id: a cheap poll, so the workspace notices outside changes. */
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/head">) => {
    const { id } = await ctx.params;
    await requireProject(id);
    const [row] = await db()
      .select({ versionId: schema.project.currentVersionId })
      .from(schema.project)
      .where(eq(schema.project.id, id));
    return NextResponse.json({ versionId: row?.versionId ?? null });
  },
);
