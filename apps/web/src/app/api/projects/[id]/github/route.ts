import { NextResponse } from "next/server";
import { enqueueRun } from "@appbuilder/core";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

const NAME = /^[A-Za-z0-9._-]{1,100}$/;

export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/github">) => {
    const { id } = await ctx.params;
    const { viewer, project } = await requireProject(id, "edit");
    if (!project.currentVersionId) throw new HttpError(400, "Build the app before exporting it.");
    const body = await readJson<{
      repo: string;
      owner?: string;
      create: boolean;
      private?: boolean;
    }>(request);
    if (!NAME.test(body.repo ?? ""))
      throw new HttpError(400, "Repository names use letters, numbers, '.', '-' and '_'.");
    if (!body.create && !NAME.test(body.owner ?? ""))
      throw new HttpError(400, "Enter the repository owner.");
    const run = await enqueueRun(db(), {
      projectId: id,
      userId: viewer!.id,
      kind: "github_push",
      input: {
        repo: body.repo,
        owner: body.owner ?? "",
        create: Boolean(body.create),
        private: body.private !== false,
      },
    });
    return NextResponse.json({ runId: run.id });
  },
);
