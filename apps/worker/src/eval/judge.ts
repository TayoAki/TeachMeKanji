/**
 * The model judge: scores an app against the rubric from its screenshots and code. It is a
 * separate call from the one that built the app and is told to be strict and evidence-based
 * (generators grade their own work too kindly). Deterministic findings are given as evidence
 * and enforced afterwards as caps, so the judge can't talk its way past them.
 */
import type Anthropic from "@anthropic-ai/sdk";
import {
  RUBRIC,
  STRUCTURE_SCREENS,
  type AppPlan,
  type JudgedCriterion,
  type ProjectFiles,
  type QualityFinding,
} from "@appbuilder/contract";
import type { CreateMessage } from "../generation/client";
/** A screenshot of one screen, as the user sees it in the builder's canvas. */
export interface Shot {
  /** The canvas label, e.g. "Paywall paywall.tsx". */
  label: string;
  theme: string;
  png: Buffer;
}

export interface JudgeIssue {
  severity: "critical" | "major" | "minor";
  part: string;
  screen: string;
  problem: string;
  fix: string;
}

export interface JudgeResult {
  criteria: Record<string, JudgedCriterion>;
  issues: JudgeIssue[];
  summary: string;
  usage: { input: number; output: number };
}

const IDS = RUBRIC.map((c) => c.id);

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["criteria", "issues", "summary"],
  properties: {
    criteria: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "score", "evidence", "fix"],
        properties: {
          id: { type: "string", enum: IDS },
          score: { type: "integer", enum: [0, 1, 2, 3] },
          evidence: { type: "string" },
          fix: { type: "string" },
        },
      },
    },
    issues: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "part", "screen", "problem", "fix"],
        properties: {
          severity: { type: "string", enum: ["critical", "major", "minor"] },
          part: { type: "string", enum: ["onboarding", "paywall", "main", "settings", "craft"] },
          screen: { type: "string" },
          problem: { type: "string" },
          fix: { type: "string" },
        },
      },
    },
    summary: { type: "string" },
  },
} as const;

const SYSTEM = `You are a strict, independent reviewer of mobile apps made by an AI app builder. You did not build this app. Your job is to find what stands between it and an app people download, keep using and pay for.

How to judge:
- Score every rubric criterion from 0 to 3 using only evidence you can point to in the screenshots or the code: name the screen and the element. Don't give credit for intentions, for the plan, or for anything you can't see.
- Calibration: 3 = what a top indie app on the App Store does; 2 = solid, shippable work with small gaps; 1 = present but weak, generic or partly broken; 0 = missing or broken.
- Judge each criterion on its own; a beautiful screen doesn't excuse a missing control.
- The deterministic findings are facts about the code; respect them.
- Platform facts (template code you aren't shown): completeOnboarding() opens the app and then shows the paywall when the app has one; the root layout shows onboarding until it is completed; purchases are simulated in this environment by design (test mode), so judge the paywall as the user would see it in a store build. useShareImage() (components/share) shares a card as an image on a phone and falls back to text in the web preview; useReminder() (data/reminders) schedules a real daily local notification on a phone.
- Be specific and useful: each fix is the single most valuable change, written so a developer could do it. Never write "overall good effort".`;

function rubricText(): string {
  return RUBRIC.map(
    (c) => `${c.id} [${c.part}] ${c.title} (${c.weight} pts). 3: ${c.good} 0: ${c.bad}`,
  ).join("\n");
}

function planText(plan: AppPlan | null): string {
  if (!plan) return "No plan is stored for this app.";
  const lines = [
    `App: ${plan.appName}: ${plan.summary}`,
    `Audience: ${plan.audience || "(not stated)"}`,
    `Angle: ${plan.angle || "(not stated)"}`,
    `Core loop: ${plan.coreLoop || "(not stated)"}`,
    `Share moment: ${plan.shareMoment || "(not stated)"}`,
  ];
  if (plan.monetization)
    lines.push(`Premium unlocks: ${plan.monetization.premiumFeatures.join("; ") || "(none)"}`);
  return lines.join("\n");
}

/** The files that show how the four parts work: structure screens, home, layout, pricing. */
function codeText(files: ProjectFiles): string {
  const paths = [
    ...Object.values(STRUCTURE_SCREENS),
    "app/(tabs)/_layout.tsx",
    "app/(tabs)/index.tsx",
    ...Object.keys(files).filter((p) => p.startsWith("app/(tabs)/") && !p.endsWith("_layout.tsx")),
    "data/monetization.ts",
  ].filter((p, i, all) => files[p] !== undefined && all.indexOf(p) === i);
  return paths
    .map((p) => {
      const source = files[p]!;
      return `<file path="${p}">\n${source.length > 14_000 ? `${source.slice(0, 14_000)}\n…(truncated)` : source}\n</file>`;
    })
    .join("\n\n");
}

export async function judgeApp(input: {
  createMessage: CreateMessage;
  model: string;
  plan: AppPlan | null;
  files: ProjectFiles;
  findings: QualityFinding[];
  shots: Shot[];
  renderErrors: string[];
}): Promise<JudgeResult> {
  const findings = input.findings
    .map(
      (f) =>
        `${f.ok ? "PASS" : "FAIL"} ${f.criterion}: ${f.message}${f.files ? ` (${f.files.join(", ")})` : ""}`,
    )
    .join("\n");
  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    {
      type: "text",
      text: `Rubric:\n${rubricText()}\n\nWhat the app set out to be:\n${planText(input.plan)}\n\nDeterministic findings:\n${findings}\n\n${
        input.renderErrors.length
          ? `Screens that failed to render: ${input.renderErrors.join(", ")}\n\n`
          : ""
      }Code:\n${codeText(input.files)}\n\nScreenshots follow, each after its label.`,
    },
  ];
  for (const shot of input.shots) {
    content.push({
      type: "text",
      text: `Screenshot: ${shot.label}${shot.theme === "default" ? "" : ` (${shot.theme} theme)`}`,
    });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: shot.png.toString("base64") },
    });
  }
  content.push({
    type: "text",
    text: `Score every criterion (${IDS.join(", ")}), then list the issues most severe first (at most 12), then a three-sentence summary of where this app stands and what to do next.`,
  });

  const response = await input.createMessage({
    model: input.model,
    max_tokens: 16_000,
    thinking: { type: "adaptive" },
    output_config: { effort: "high", format: { type: "json_schema", schema: SCHEMA } },
    system: SYSTEM,
    messages: [{ role: "user", content }],
  });
  const text = response.content
    .filter((b): b is Anthropic.Beta.Messages.BetaTextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const parsed = JSON.parse(text) as {
    criteria: Array<{ id: string; score: number; evidence: string; fix: string }>;
    issues: JudgeIssue[];
    summary: string;
  };
  const order = { critical: 0, major: 1, minor: 2 };
  return {
    criteria: Object.fromEntries(
      parsed.criteria.map((c) => [c.id, { score: c.score, evidence: c.evidence, fix: c.fix }]),
    ),
    issues: [...parsed.issues].sort((a, b) => order[a.severity] - order[b.severity]),
    summary: parsed.summary,
    usage: { input: response.usage.input_tokens, output: response.usage.output_tokens },
  };
}

/** Average several judges per criterion; keep the first judge's words and every judge's issues. */
export function combineJudges(results: JudgeResult[]): {
  criteria: Record<string, JudgedCriterion & { scores: number[] }>;
  issues: JudgeIssue[];
  summary: string;
} {
  const criteria: Record<string, JudgedCriterion & { scores: number[] }> = {};
  for (const id of IDS) {
    const scores = results.map((r) => r.criteria[id]?.score ?? 0);
    const first = results.find((r) => r.criteria[id])?.criteria[id];
    criteria[id] = {
      score: Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10,
      scores,
      evidence: first?.evidence ?? "Not judged.",
      fix: first?.fix ?? "",
    };
  }
  return {
    criteria,
    issues: results.flatMap((r) => r.issues),
    summary: results[0]?.summary ?? "",
  };
}
