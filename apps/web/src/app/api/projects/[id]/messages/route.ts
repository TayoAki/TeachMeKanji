import { NextResponse } from "next/server";
import { activeRun, addMessage, assertRunRate, enqueueRun, latestPlan } from "@appbuilder/core";
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
      selection?: { path: string; snippet?: string; kind?: "element" | "screen" } | null;
      /** "Fix with AI" on reported errors: marked fixed when the edit is saved. */
      errorIds?: unknown;
    }>(request);
    const errorIds = Array.isArray(body.errorIds)
      ? body.errorIds.filter((x): x is string => typeof x === "string").slice(0, 10)
      : [];
    const text = String(body.text ?? "").trim();
    if (!text || text.length > 4000)
      throw new HttpError(400, "Write a message of up to 4000 characters.");
    if (await activeRun(db(), id)) throw new HttpError(409, "Wait for the current step to finish.");
    await assertRunRate(db(), viewer!.id);

    const selection =
      body.selection && typeof body.selection.path === "string"
        ? {
            path: body.selection.path.slice(0, 200),
            snippet: String(body.selection.snippet ?? "").slice(0, 4000),
            // A whole screen (picked on the canvas) or one element (picked in the preview).
            kind: body.selection.kind === "screen" ? ("screen" as const) : ("element" as const),
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
        input: { request: text, selection, ...(errorIds.length ? { errorIds } : {}) },
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
