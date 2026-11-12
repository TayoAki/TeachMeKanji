import { NextResponse } from "next/server";
import { listAppErrors, resolveAppErrors } from "@appbuilder/core";
import { db, readJson, requireProject, route } from "@/lib/server";

/** The Errors tab: errors the app reported from phones, open ones first. */
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/errors">) => {
    const { id } = await ctx.params;
    await requireProject(id, "edit");
    const errors = await listAppErrors(db(), id, { includeResolved: true, limit: 100 });
    return NextResponse.json({
      errors: errors.map((e) => ({
        id: e.id,
        message: e.message,
        stack: e.stack,
        screen: e.screen,
        platform: e.platform,
        fatal: e.fatal,
        test: e.test,
        count: e.count,
        firstSeen: e.firstSeen,
        lastSeen: e.lastSeen,
        resolved: e.resolvedAt !== null,
      })),
    });
  },
);

/** Mark errors fixed or dismissed; a new report of the same error reopens it. */
export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/errors">) => {
    const { id } = await ctx.params;
    await requireProject(id, "edit");
    const { resolve } = await readJson<{ resolve?: unknown }>(request);
    const ids = Array.isArray(resolve)
      ? resolve.filter((x): x is string => typeof x === "string")
      : [];
    await resolveAppErrors(db(), id, ids.slice(0, 100));
    return NextResponse.json({ ok: true });
  },
);
