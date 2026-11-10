/**
 * Score a built app against the quality rubric (docs/08-app-quality-rubric.md).
 *
 *   EVAL_EMAIL=… EVAL_PASSWORD=… [ANTHROPIC_API_KEY=…] \
 *     npm run eval -w @appbuilder/worker -- --project p_123 --name kanji-v1 \
 *       [--base-url https://app.example.com] [--judges 2] [--out docs/evals] [--remote]
 *
 * Signs in to the builder as a user who can open the project, screenshots every screen, runs
 * the deterministic checks, asks independent judges, and writes <out>/<name>.md, .json and .png.
 * With --remote the judging runs as a "review" job on the builder's worker (its model key, the
 * user's credits) instead of locally with ANTHROPIC_API_KEY.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { qualityCaps, qualityChecks, scoreRubric, type RubricScore } from "@appbuilder/contract";
import { anthropicCreateMessage } from "../generation/client";
import { apiSession, captureProject, contactSheet, type Capture } from "./capture";
import { combineJudges, judgeApp, type JudgeIssue } from "./judge";
import { reportMarkdown, type EvalReport } from "./report";

const MODEL = process.env.EVAL_MODEL || "claude-opus-5-5";
// Opus 5.5 list prices per million tokens.
const PRICE = { input: 4, output: 20 };

async function main() {
  const { values } = parseArgs({
    options: {
      project: { type: "string" },
      name: { type: "string" },
      "base-url": { type: "string", default: "http://localhost:3000" },
      judges: { type: "string", default: "2" },
      out: { type: "string", default: "docs/evals" },
      remote: { type: "boolean", default: false },
    },
  });
  const projectId = values.project;
  const email = process.env.EVAL_EMAIL || "";
  const password = process.env.EVAL_PASSWORD || "";
  if (!projectId || !email || !password)
    throw new Error("Usage: --project <id> with EVAL_EMAIL and EVAL_PASSWORD set.");
  const baseUrl = values["base-url"]!.replace(/\/$/, "");
  const name = values.name || projectId;
  const out = resolve(process.cwd(), "../..", values.out!);
  const judges = Math.max(1, Number(values.judges) || 2);

  console.log(`eval: capturing ${projectId} from ${baseUrl}`);
  const capture = await captureProject({ baseUrl, email, password, projectId });
  console.log(
    `eval: ${capture.shots.length} screenshots, ${capture.renderErrors.length} render errors`,
  );
  const judged = values.remote
    ? await judgeRemotely(baseUrl, projectId, capture, judges)
    : await judgeLocally(capture, judges);
  const { score, findings, issues, summary, judgeScores, costUsd } = judged;

  const report: EvalReport = {
    name,
    appName: capture.appName,
    versionNumber: capture.versionNumber,
    date: new Date().toISOString().slice(0, 10),
    baseUrl,
    projectId,
    model: judged.model,
    judges,
    score,
    judgeScores,
    findings,
    issues,
    summary,
    renderErrors: capture.renderErrors,
    costUsd,
  };
  await mkdir(out, { recursive: true });
  await writeFile(join(out, `${name}.png`), await contactSheet(capture.shots));
  await writeFile(join(out, `${name}.json`), JSON.stringify(report, null, 2) + "\n");
  await writeFile(join(out, `${name}.md`), reportMarkdown(report, `${name}.png`));
  console.log(
    `eval: ${capture.appName} scored ${score.total} / 100 → ${join(values.out!, `${name}.md`)}`,
  );
}

interface Judged {
  model: string;
  score: RubricScore;
  findings: ReturnType<typeof qualityChecks>;
  issues: JudgeIssue[];
  summary: string;
  judgeScores: Record<string, number[]>;
  costUsd: number;
}

async function judgeLocally(capture: Capture, judges: number): Promise<Judged> {
  const findings = qualityChecks(capture.files);
  const createMessage = anthropicCreateMessage();
  console.log(`eval: ${judges} judges (${MODEL})`);
  const results = await Promise.all(
    Array.from({ length: judges }, () =>
      judgeApp({
        createMessage,
        model: MODEL,
        plan: capture.plan,
        files: capture.files,
        findings,
        shots: capture.shots,
        renderErrors: capture.renderErrors,
      }),
    ),
  );
  const combined = combineJudges(results);
  return {
    model: MODEL,
    score: scoreRubric(combined.criteria, qualityCaps(findings), {
      renderFailure: capture.renderErrors.length > 0,
    }),
    findings,
    issues: combined.issues,
    summary: combined.summary,
    judgeScores: Object.fromEntries(
      Object.entries(combined.criteria).map(([id, c]) => [id, c.scores]),
    ),
    costUsd: results.reduce(
      (sum, r) => sum + (r.usage.input * PRICE.input + r.usage.output * PRICE.output) / 1e6,
      0,
    ),
  };
}

/** Upload the screenshots and let the builder's worker judge them (a "review" run). */
async function judgeRemotely(
  baseUrl: string,
  projectId: string,
  capture: Capture,
  judges: number,
): Promise<Judged> {
  const api = await apiSession(baseUrl, capture.storageState);
  try {
    const started = await api.post(`/api/projects/${projectId}/review`, {
      data: {
        judges,
        renderErrors: capture.renderErrors,
        shots: capture.shots.map((s) => ({
          label: s.label,
          theme: s.theme,
          png: s.png.toString("base64"),
        })),
      },
    });
    if (!started.ok()) throw new Error(`review failed to start: ${await started.text()}`);
    const { runId } = (await started.json()) as { runId: string };
    console.log(`eval: review run ${runId} started on the worker`);
    const deadline = Date.now() + 15 * 60_000;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 5_000));
      const { runs } = (await (
        await api.get(`/api/projects/${projectId}/runs?kind=review`)
      ).json()) as {
        runs: Array<{
          id: string;
          status: string;
          error: string | null;
          creditsCharged: number | null;
          output: Omit<Judged, "costUsd"> | null;
        }>;
      };
      const run = runs.find((r) => r.id === runId);
      if (!run || run.status === "queued" || run.status === "running") continue;
      if (run.status !== "succeeded" || !run.output)
        throw new Error(`review ${run.status}: ${run.error ?? "no output"}`);
      // One credit is $0.05 of measured model cost.
      return { ...run.output, costUsd: (run.creditsCharged ?? 0) * 0.05 };
    }
    throw new Error("review timed out");
  } finally {
    await api.dispose();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
