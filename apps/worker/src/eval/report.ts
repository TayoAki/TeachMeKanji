import {
  RUBRIC_PARTS,
  type QualityFinding,
  type RubricPart,
  type RubricScore,
} from "@appbuilder/contract";
import type { JudgeIssue } from "./judge";

export interface EvalReport {
  name: string;
  appName: string;
  versionNumber: number | null;
  date: string;
  baseUrl: string;
  projectId: string;
  model: string;
  judges: number;
  score: RubricScore;
  judgeScores: Record<string, number[]>;
  findings: QualityFinding[];
  issues: JudgeIssue[];
  summary: string;
  renderErrors: string[];
  costUsd: number;
}

const cell = (text: string) => text.replace(/\|/g, "\\|").replace(/\n+/g, " ");

export function reportMarkdown(report: EvalReport, sheetFile: string): string {
  const { score } = report;
  const parts = (Object.keys(RUBRIC_PARTS) as RubricPart[])
    .map(
      (part) =>
        `| ${RUBRIC_PARTS[part]} | ${score.parts[part].points} / ${score.parts[part].max} |`,
    )
    .join("\n");
  const criteria = score.criteria
    .map(
      (c) =>
        `| ${c.id} | ${c.title} | ${c.points} / ${c.weight} | ${c.score}${
          c.cap < 3 && c.cap < c.judged ? ` (judged ${c.judged}, capped at ${c.cap})` : ""
        } | ${(report.judgeScores[c.id] ?? []).join(", ")} | ${cell(c.evidence)} | ${cell(c.fix)} |`,
    )
    .join("\n");
  const failed = report.findings.filter((f) => !f.ok);
  const issues = report.issues
    .map((i) => `- **${i.severity}** · ${i.part} · ${i.screen}: ${i.problem} *Fix:* ${i.fix}`)
    .join("\n");
  return `# ${report.appName}: ${score.total} / 100

${report.summary}

- App: ${report.appName}, version ${report.versionNumber ?? "?"} (${report.baseUrl}/projects/${report.projectId})
- Evaluated ${report.date} with ${report.judges} independent judge${report.judges === 1 ? "" : "s"} (${report.model}), about $${report.costUsd.toFixed(2)}
${score.cappedBy ? `- **${score.cappedBy}**\n` : ""}${report.renderErrors.length ? `- Screens that failed to render: ${report.renderErrors.join(", ")}\n` : ""}
![Screens](${sheetFile})

## Score by part

| Part | Points |
|---|---:|
${parts}
| **Total** | **${score.total} / 100** |

## Criteria

Scores are 0–3 (averaged across judges), then capped by the deterministic checks.

| | Criterion | Points | Score | Judges | Evidence | Most valuable fix |
|---|---|---:|---|---|---|---|
${criteria}

## Issues, most severe first

${issues || "None reported."}

## Deterministic checks that failed

${failed.length ? failed.map((f) => `- ${f.criterion}: ${f.message}${f.files ? ` (${f.files.join(", ")})` : ""} → caps at ${f.cap}`).join("\n") : "None."}
`;
}
