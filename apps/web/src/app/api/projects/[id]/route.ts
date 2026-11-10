import { NextResponse } from "next/server";
import { defaultThemeOf, withDefaultTheme } from "@appbuilder/contract";
import {
  activeRun,
  canSeeSource,
  commitVersion,
  creditBalance,
  deleteProject,
  getCurrentFiles,
  latestPlan,
  listMessages,
  updateProject,
  userPlan,
  VersionConflict,
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
  const { viewer } = await requireProject(id, needsOwner ? "manage" : "edit");
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
  let versionId: string | null = null;
  if (body.activeThemeId !== undefined) {
    const themeId = String(body.activeThemeId).slice(0, 60);
    patch.activeThemeId = themeId;
    // The pick becomes the theme the app opens in (phone, export, publish), as a version. While
    // a run is writing files the pick only changes the preview, so the run doesn't undo it.
    const current = await getCurrentFiles(db(), id);
    const next = current.versionId ? withDefaultTheme(current.files, themeId) : null;
    if (next && defaultThemeOf(current.files) !== themeId && !(await activeRun(db(), id))) {
      const tokens = next["theme/tokens.ts"]!;
      const name = new RegExp(`id:\\s*["'\`]${themeId}["'\`][^}]*?name:\\s*["'\`]([^"'\`]+)`).exec(
        tokens,
      )?.[1];
      try {
        const version = await commitVersion(db(), {
          projectId: id,
          files: next,
          kind: "theme",
          summary: `Theme: ${name ?? themeId}`,
          createdBy: viewer?.id,
          expectedParentId: current.versionId!,
        });
        versionId = version.id;
      } catch (error) {
        // Another change landed first; the preview still shows the pick.
        if (!(error instanceof VersionConflict)) throw error;
      }
    }
  }
  await updateProject(db(), id, patch);
  return NextResponse.json({ ok: true, versionId });
});

export const DELETE = route(async (_request: Request, ctx: RouteContext<"/api/projects/[id]">) => {
  const { id } = await ctx.params;
  await requireProject(id, "manage");
  await deleteProject(db(), id);
  return NextResponse.json({ ok: true });
});
