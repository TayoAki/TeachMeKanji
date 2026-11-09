import { NextResponse } from "next/server";
import {
  activeRun,
  canSeeSource,
  creditBalance,
  deleteProject,
  getCurrentFiles,
  latestPlan,
  listMessages,
  updateProject,
  userPlan,
  versionNumbers,
} from "@appbuilder/core";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

export const GET = route(async (_request: Request, ctx: RouteContext<"/api/projects/[id]">) => {
  const { id } = await ctx.params;
  const { project, access, viewer } = await requireProject(id);
  const { versionId, files } = await getCurrentFiles(db(), id);
  const source = canSeeSource(access);
  const planRow = source ? await latestPlan(db(), id) : null;
  const run = source ? await activeRun(db(), id) : null;
  return NextResponse.json({
    project: {
      id: project.id,
      name: project.name,
      prompt: source ? project.prompt : null,
      status: project.status,
      visibility: project.visibility,
      platforms: project.platforms,
      activeThemeId: project.activeThemeId,
      publishedSlug: project.publishedSlug,
      backend: project.backend,
      updatedAt: project.updatedAt,
    },
    access,
    versionId,
    versionNumber: versionId
      ? ((await versionNumbers(db(), [versionId])).get(versionId) ?? null)
      : null,
    files,
    plan: planRow
      ? { id: planRow.id, number: planRow.number, status: planRow.status, data: planRow.data }
      : null,
    messages: source ? await listMessages(db(), id) : [],
    activeRun: run ? { id: run.id, kind: run.kind, status: run.status } : null,
    credits: viewer ? await creditBalance(db(), viewer.id) : null,
    plan_tier: viewer ? await userPlan(db(), viewer.id) : null,
  });
});

export const PATCH = route(async (request: Request, ctx: RouteContext<"/api/projects/[id]">) => {
  const { id } = await ctx.params;
  const body = await readJson<{
    name?: string;
    visibility?: "private" | "public";
    activeThemeId?: string;
  }>(request);
  const needsOwner = body.visibility !== undefined;
  await requireProject(id, needsOwner ? "manage" : "edit");
  const patch: Parameters<typeof updateProject>[2] = {};
  if (body.name !== undefined) {
    const name = body.name.trim();
    if (name.length < 1 || name.length > 80)
      throw new HttpError(400, "Names are 1 to 80 characters.");
    patch.name = name;
  }
  if (body.visibility !== undefined) {
    if (!["private", "public"].includes(body.visibility))
      throw new HttpError(400, "Invalid visibility.");
    patch.visibility = body.visibility;
  }
  if (body.activeThemeId !== undefined)
    patch.activeThemeId = String(body.activeThemeId).slice(0, 60);
  await updateProject(db(), id, patch);
  return NextResponse.json({ ok: true });
});

export const DELETE = route(async (_request: Request, ctx: RouteContext<"/api/projects/[id]">) => {
  const { id } = await ctx.params;
  await requireProject(id, "manage");
  await deleteProject(db(), id);
  return NextResponse.json({ ok: true });
});
