import { NextResponse } from "next/server";
import {
  activeRun,
  approveAllDesign,
  assertRunRate,
  createDesign,
  currentDesign,
  designStepAvailable,
  enqueueRun,
  getCurrentFiles,
  latestPlan,
  reviewDesignItem,
} from "@appbuilder/core";
import { workspaceDesign } from "@/lib/design";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

type Ctx = RouteContext<"/api/projects/[id]/design">;

/** The design for the project's latest plan (mockups, mascot, approvals). */
export const GET = route(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await requireProject(id, "edit");
  const plan = await latestPlan(db(), id);
  return NextResponse.json(await workspaceDesign(id, plan?.id ?? null));
});

/** Design the app before building it: research is in the plan; this draws the mockups. */
export const POST = route(async (_request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const { viewer } = await requireProject(id, "edit");
  if (await activeRun(db(), id)) throw new HttpError(409, "Wait for the current step to finish.");
  const plan = await latestPlan(db(), id);
  if (!plan || plan.status !== "proposed")
    throw new HttpError(400, "There is no plan to design yet.");
  if ((await getCurrentFiles(db(), id)).versionId)
    throw new HttpError(400, "This app is already built. Change it from the chat instead.");
  if (!(await designStepAvailable(db())))
    throw new HttpError(
      503,
      "Mockups aren't available right now. Build straight from the plan instead.",
    );
  await assertRunRate(db(), viewer!.id);
  const design = await createDesign(db(), { projectId: id, planId: plan.id });
  const run = await enqueueRun(db(), {
    projectId: id,
    userId: viewer!.id,
    kind: "design",
    input: { designId: design.id },
  });
  return NextResponse.json({ runId: run.id, designId: design.id });
});

/** Approve a mockup (or all of them), or ask for a change (redrawn by POST …/design/redo). */
export const PATCH = route(async (request: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await requireProject(id, "edit");
  const body = await readJson<{
    approveAll?: boolean;
    path?: string;
    status?: string;
    note?: string;
  }>(request);
  const plan = await latestPlan(db(), id);
  const design = await currentDesign(db(), id, plan?.id ?? null);
  if (!design) throw new HttpError(404, "There are no mockups to review.");
  if (body.approveAll) await approveAllDesign(db(), design.id);
  else {
    if (typeof body.path !== "string" || (body.status !== "approved" && body.status !== "changes"))
      throw new HttpError(400, "Say which mockup and whether it's approved.");
    await reviewDesignItem(db(), design.id, {
      path: body.path,
      status: body.status,
      note: typeof body.note === "string" ? body.note : "",
    });
  }
  return NextResponse.json(await workspaceDesign(id, plan?.id ?? null));
});
