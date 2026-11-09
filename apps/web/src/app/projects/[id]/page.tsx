import { notFound, redirect } from "next/navigation";
import {
  activeRun,
  canSeeSource,
  creditBalance,
  getCurrentFiles,
  latestPlan,
  listMessages,
  projectAccess,
  userPlan,
  versionNumbers,
} from "@appbuilder/core";
import { Workspace } from "@/components/workspace/workspace";
import type { ProjectState } from "@/components/workspace/types";
import { plain } from "@/lib/serialize";
import { db, getViewer } from "@/lib/server";

export default async function ProjectPage({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const viewer = await getViewer();
  const result = await projectAccess(db(), id, viewer);
  if (!result) {
    if (!viewer) redirect("/sign-in");
    notFound();
  }
  const { project, access } = result;
  const source = canSeeSource(access);
  const { versionId, files } = await getCurrentFiles(db(), id);
  const planRow = source ? await latestPlan(db(), id) : null;
  const run = source ? await activeRun(db(), id) : null;

  const initial = plain({
    project: {
      id: project.id,
      name: project.name,
      prompt: source ? project.prompt : null,
      status: project.status,
      visibility: project.visibility,
      platforms: project.platforms,
      activeThemeId: project.activeThemeId,
      publishedSlug: project.publishedSlug,
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
  }) as unknown as ProjectState;

  return (
    <Workspace
      initial={initial}
      user={viewer ? { name: viewer.name, email: viewer.email, image: viewer.image } : null}
    />
  );
}

export async function generateMetadata({ params }: PageProps<"/projects/[id]">) {
  const { id } = await params;
  const result = await projectAccess(db(), id, await getViewer());
  return { title: result?.project.name ?? "Project" };
}
