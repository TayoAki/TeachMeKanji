import { desc, eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { schema } from "@appbuilder/db";
import { db, requireViewer, route } from "@/lib/server";

/** Recent runs across the viewer's projects (the rail's activity bell). */
export const GET = route(async () => {
  const viewer = await requireViewer();
  const rows = await db()
    .select({
      id: schema.agentRun.id,
      kind: schema.agentRun.kind,
      status: schema.agentRun.status,
      error: schema.agentRun.error,
      createdAt: schema.agentRun.createdAt,
      creditsCharged: schema.agentRun.creditsCharged,
      projectId: schema.project.id,
      projectName: schema.project.name,
    })
    .from(schema.agentRun)
    .innerJoin(schema.project, eq(schema.project.id, schema.agentRun.projectId))
    .where(eq(schema.agentRun.userId, viewer.id))
    .orderBy(desc(schema.agentRun.createdAt))
    .limit(20);
  return NextResponse.json({ activity: rows });
});
