/**
 * Score a built app against the quality rubric (docs/08-app-quality-rubric.md).
 *
 *   EVAL_EMAIL=… EVAL_PASSWORD=… ANTHROPIC_API_KEY=… \
 *     npm run eval -w @appbuilder/worker -- --project p_123 --name kanji-v1 \
 *       [--base-url https://app.example.com] [--judges 2] [--out docs/evals]
 *
 * Signs in to the builder as a user who can open the project, screenshots every screen, runs
 * the deterministic checks, asks independent judges, and writes <out>/<name>.md, .json and .png.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { qualityCaps, qualityChecks, scoreRubric } from "@appbuilder/contract";
import { anthropicCreateMessage } from "../generation/client";
import { captureProject, contactSheet } from "./capture";
import { combineJudges, judgeApp } from "./judge";
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
  const score = scoreRubric(combined.criteria, qualityCaps(findings), {
    renderFailure: capture.renderErrors.length > 0,
  });
  const costUsd = results.reduce(
    (sum, r) => sum + (r.usage.input * PRICE.input + r.usage.output * PRICE.output) / 1e6,
    0,
  );

  const report: EvalReport = {
    name,
    appName: capture.appName,
    versionNumber: capture.versionNumber,
    date: new Date().toISOString().slice(0, 10),
    baseUrl,
    projectId,
    model: MODEL,
    judges,
    score,
    judgeScores: Object.fromEntries(
      Object.entries(combined.criteria).map(([id, c]) => [id, c.scores]),
    ),
    findings,
    issues: combined.issues,
    summary: combined.summary,
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

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
