import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { connectorById } from "@appbuilder/contract";
import { schema } from "@appbuilder/db";
import { db, requireViewer, route } from "@/lib/server";

/** The viewer's connected connectors (ids and labels only; tokens never leave the server). */
export const GET = route(async () => {
  const viewer = await requireViewer();
  const rows = await db()
    .select({
      provider: schema.integration.provider,
      label: schema.integration.label,
      auth: schema.integration.auth,
    })
    .from(schema.integration)
    .where(eq(schema.integration.userId, viewer.id));
  return NextResponse.json({
    connected: rows.filter((r) => connectorById(r.provider)),
  });
});
