import { NextResponse } from "next/server";
import { connectorById, type ConnectorId } from "@appbuilder/contract";
import { connectorAccess, testConnector } from "@appbuilder/core";
import { db, HttpError, requireViewer, route } from "@/lib/server";

/**
 * Settings → Connectors → Test: the connection works the way a build would use it (a fresh
 * token, refreshed if needed, and the server lists its tools). Reads none of the user's data.
 */
export const POST = route(
  async (_request: Request, ctx: RouteContext<"/api/connectors/[id]/test">) => {
    const viewer = await requireViewer();
    const { id } = await ctx.params;
    if (!connectorById(id)) throw new HttpError(404, "Unknown connector.");
    const { connectors, problems } = await connectorAccess(db(), viewer.id, [id as ConnectorId]);
    if (!connectors.length) return NextResponse.json({ ok: false, error: problems[0] });
    return NextResponse.json(await testConnector(connectors[0]!));
  },
);
