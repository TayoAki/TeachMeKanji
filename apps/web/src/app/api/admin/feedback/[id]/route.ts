import { NextResponse } from "next/server";
import { updateFeedback } from "@appbuilder/core";
import { db, readJson, requireAdmin, route } from "@/lib/server";

/** Triage one report: `{ "status": "planned", "reply": "…" }` (either field may be left out). */
export const PATCH = route(
  async (request: Request, ctx: RouteContext<"/api/admin/feedback/[id]">) => {
    await requireAdmin(request);
    const { id } = await ctx.params;
    const body = await readJson<{ status?: unknown; reply?: unknown }>(request);
    const row = await updateFeedback(db(), id, body);
    return NextResponse.json({ id: row.id, status: row.status, reply: row.reply });
  },
);
