import { NextResponse } from "next/server";
import { activeRun, addMessage, enqueueRun, latestPlan } from "@appbuilder/core";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

/**
 * A chat message drives the agent: before a build it plans (or revises the plan with the
 * message as feedback); after a build it edits the app.
 */
export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/messages">) => {
    const { id } = await ctx.params;
    const { project, viewer } = await requireProject(id, "edit");
    const body = await readJson<{
      text?: string;
      selection?: { path: string; snippet: string } | null;
    }>(request);
    const text = String(body.text ?? "").trim();
    if (!text || text.length > 4000)
      throw new HttpError(400, "Write a message of up to 4000 characters.");
    if (await activeRun(db(), id)) throw new HttpError(409, "Wait for the current step to finish.");

    const selection =
      body.selection && typeof body.selection.path === "string"
        ? {
            path: body.selection.path.slice(0, 200),
            snippet: String(body.selection.snippet).slice(0, 4000),
          }
        : null;
    await addMessage(db(), {
      projectId: id,
      role: "user",
      userId: viewer!.id,
      content: { text, selection },
    });

    let run;
    if (project.currentVersionId) {
      run = await enqueueRun(db(), {
        projectId: id,
        userId: viewer!.id,
        kind: "edit",
        input: { request: text, selection },
      });
    } else {
      const plan = await latestPlan(db(), id);
      run = await enqueueRun(db(), {
        projectId: id,
        userId: viewer!.id,
        kind: "plan",
        input: plan ? { feedback: text } : {},
      });
    }
    return NextResponse.json({ runId: run.id, kind: run.kind });
  },
);
