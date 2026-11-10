import { NextResponse } from "next/server";
import { assertRunRate, enqueueRun } from "@appbuilder/core";
import { db, requireProject, route } from "@/lib/server";

/** Create the app's products, entitlement and offering in the user's RevenueCat (a worker run). */
export const POST = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/payments/setup">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "manage");
    await assertRunRate(db(), viewer!.id);
    const run = await enqueueRun(db(), {
      projectId: id,
      userId: viewer!.id,
      kind: "payments_setup",
      input: {},
    });
    return NextResponse.json({ runId: run.id });
  },
);
