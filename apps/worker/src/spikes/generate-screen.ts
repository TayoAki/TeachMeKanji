/**
 * Spike C: generate one screen with Claude against the contract, validate it, repair if needed.
 *
 *   ANTHROPIC_API_KEY=... npm run spike:generate
 *   npm run spike:generate -- --path "app/(tabs)/insights.tsx" --purpose "..."
 *
 * Writes the generated file plus a report to .spike-output/generated/.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { formatIssues } from "@appbuilder/contract";
import { anthropicCreateMessage, estimateCostUsd } from "../generation/client";
import { generateFile } from "../generation/generate-file";
import { fixtureProject, REPO_ROOT } from "../project";

const arg = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`);
  return i === -1 ? fallback : process.argv[i + 1]!;
};

const spec = {
  path: arg("path", "app/(tabs)/insights.tsx"),
  purpose: arg(
    "purpose",
    [
      "An 'Insights' tab that helps the user understand their consistency.",
      "- A headline card with the overall completion rate for the last 7 days (check-ins done / habits x 7).",
      "- The user's best current streak and which habit it belongs to.",
      "- A list of habits ranked by how many days in the last 7 they were done, each with a small progress bar and a link to the habit's detail screen.",
      "- A short encouraging message that changes with the completion rate.",
    ].join("\n"),
  ),
};

const files = await fixtureProject();
const started = Date.now();
const result = await generateFile({
  createMessage: anthropicCreateMessage(),
  files,
  spec,
  exampleScreen: "app/(tabs)/index.tsx",
});
const seconds = ((Date.now() - started) / 1000).toFixed(1);
const cost = estimateCostUsd(result.model, result.usage);

const outDir = join(REPO_ROOT, ".spike-output/generated");
await mkdir(outDir, { recursive: true });
const outFile = join(outDir, spec.path.replace(/[/()]/g, "_"));
await writeFile(outFile, result.code);
const report = {
  path: spec.path,
  ok: result.ok,
  attempts: result.attempts,
  seconds: Number(seconds),
  model: result.model,
  usage: result.usage,
  estimatedCostUsd: cost,
  issues: result.issues,
};
await writeFile(join(outDir, "report.json"), JSON.stringify(report, null, 2));

console.log(result.code);
console.log("-".repeat(60));
console.log(
  `${result.ok ? "VALID" : "INVALID"} after ${result.attempts} attempt(s) in ${seconds}s, ` +
    `tokens in ${result.usage.input} / out ${result.usage.output} / cache read ${result.usage.cacheRead} / cache write ${result.usage.cacheWrite}` +
    (cost !== null ? `, about $${cost.toFixed(3)}` : ""),
);
if (result.issues.length) console.log(formatIssues(result.issues));
console.log(`written to ${outFile}`);
process.exit(result.ok ? 0 : 1);
