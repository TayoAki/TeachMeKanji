import type { DesignView } from "@appbuilder/contract";
import { activeRun, currentDesign, designStepAvailable, designView } from "@appbuilder/core";
import { db } from "@/lib/server";

/** projects/<id>/design/<designId>/<file> → the route that serves it to project members. */
export function designImageUrl(projectId: string, key: string): string {
  const [, , , designId, file] = key.split("/");
  return `/api/projects/${projectId}/design/${designId}/${file}`;
}

/** The design shown in the workspace (for the latest plan), and whether one can be made. */
export async function workspaceDesign(
  projectId: string,
  planId: string | null,
): Promise<{ design: DesignView | null; designAvailable: boolean }> {
  const row = await currentDesign(db(), projectId, planId);
  const view = row ? designView(row, (key) => designImageUrl(projectId, key)) : null;
  // A design still "generating" with no run behind it was interrupted (a worker restart).
  if (view?.status === "generating" && !(await activeRun(db(), projectId))) {
    view.status = "failed";
    view.error = "Drawing the mockups stopped before it finished. Try again.";
  }
  return { design: view, designAvailable: await designStepAvailable(db()) };
}
