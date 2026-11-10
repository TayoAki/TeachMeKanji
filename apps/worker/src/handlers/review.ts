/**
 * Review an app against the quality rubric (docs/08-app-quality-rubric.md): deterministic checks
 * over the current version's code plus independent model judges looking at screenshots of every
 * screen. The screenshots are uploaded by the caller (the eval CLI captures them from the
 * canvas); they are deleted once judged. Runs on the worker so the model key stays here.
 */
import { qualityCaps, qualityChecks, scoreRubric, type AppPlan } from "@appbuilder/contract";
import { getCurrentFiles, getStorage, latestPlan } from "@appbuilder/core";
import { AgentError } from "../agents/agents";
import { combineJudges, judgeApp, type Shot } from "../eval/judge";
import type { HandlerContext, HandlerResult } from "./context";

interface ReviewInput {
  shots?: Array<{ label: string; theme: string; key: string }>;
  renderErrors?: string[];
  judges?: number;
}

export async function handleReview(ctx: HandlerContext): Promise<HandlerResult> {
  const input = (ctx.run.input ?? {}) as ReviewInput;
  const { versionId, files } = await getCurrentFiles(ctx.db, ctx.run.projectId);
  if (!versionId) throw new AgentError("Build the app before reviewing it.");
  const plan = ((await latestPlan(ctx.db, ctx.run.projectId))?.data as AppPlan | undefined) ?? null;

  const storage = getStorage();
  const shots: Shot[] = [];
  for (const shot of (input.shots ?? []).slice(0, 16)) {
    const stored = await storage.get(shot.key);
    if (stored) shots.push({ label: shot.label, theme: shot.theme, png: stored.data });
  }
  const renderErrors = input.renderErrors ?? [];
  const judges = Math.min(3, Math.max(1, Math.round(input.judges ?? 2)));
  await ctx.emit("step", {
    label: `Reviewing ${shots.length} screenshots with ${judges} judge${judges === 1 ? "" : "s"}`,
  });

  try {
    const findings = qualityChecks(files);
    const results = await Promise.all(
      Array.from({ length: judges }, () =>
        judgeApp({
          createMessage: ctx.createMessage,
          model: ctx.model,
          plan,
          files,
          findings,
          shots,
          renderErrors,
        }),
      ),
    );
    const combined = combineJudges(results);
    const score = scoreRubric(combined.criteria, qualityCaps(findings), {
      renderFailure: renderErrors.length > 0,
    });
    return {
      output: {
        versionId,
        model: ctx.model,
        judges,
        screenshots: shots.length,
        score,
        judgeScores: Object.fromEntries(
          Object.entries(combined.criteria).map(([id, c]) => [id, c.scores]),
        ),
        findings,
        issues: combined.issues,
        summary: combined.summary,
        renderErrors,
      },
    };
  } finally {
    for (const shot of input.shots ?? []) await storage.delete(shot.key).catch(() => {});
  }
}
