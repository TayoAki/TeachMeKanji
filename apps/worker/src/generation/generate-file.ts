import type Anthropic from "@anthropic-ai/sdk";
import {
  formatIssues,
  hasErrors,
  validateFile,
  type Issue,
  type ProjectFiles,
} from "@appbuilder/contract";
import {
  addUsage,
  DEFAULT_EFFORT,
  DEFAULT_MODEL,
  textOf,
  type CreateMessage,
  type UsageTotals,
} from "./client";
import {
  contractRules,
  extractCode,
  fileRequest,
  projectContext,
  repairRequest,
  SINGLE_FILE_OUTPUT,
  type FileSpec,
} from "./prompt";

export interface GenerateFileResult {
  path: string;
  code: string;
  attempts: number;
  issues: Issue[];
  ok: boolean;
  usage: UsageTotals;
  model: string;
}

export class GenerationStopped extends Error {
  constructor(
    readonly stopReason: string | null,
    detail?: string,
  ) {
    super(`generation stopped: ${stopReason}${detail ? ` (${detail})` : ""}`);
  }
}

/**
 * Generate one file against the contract: write → validate → repair (at most `maxRepairs`
 * times). The conversation is append-only — each repair sends the model's previous turn back
 * unchanged (thinking blocks included) and adds the validator's findings.
 */
export async function generateFile(options: {
  createMessage: CreateMessage;
  files: ProjectFiles;
  spec: FileSpec;
  exampleScreen?: string;
  maxRepairs?: number;
  model?: string;
}): Promise<GenerateFileResult> {
  const { createMessage, files, spec, maxRepairs = 2, model = DEFAULT_MODEL } = options;
  const paths = new Set([...Object.keys(files), spec.path]);

  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = [
    { type: "text", text: `${contractRules()}\n\n${SINGLE_FILE_OUTPUT}` },
    {
      type: "text",
      text: projectContext(files, { exampleScreen: options.exampleScreen }),
      // Rules + project context are identical for every file in a project: cache them.
      cache_control: { type: "ephemeral" },
    },
  ];
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    { role: "user", content: fileRequest(spec) },
  ];

  let usage: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  let code = "";
  let issues: Issue[] = [];

  for (let attempt = 1; attempt <= maxRepairs + 1; attempt++) {
    // A repair fixes code that failed the platform's checks: the user doesn't pay for it.
    const response = await createMessage(
      {
        model,
        max_tokens: 64_000,
        output_config: { effort: DEFAULT_EFFORT },
        system,
        messages,
      },
      attempt > 1 ? { free: true } : undefined,
    );
    usage = addUsage(usage, response);

    if (response.stop_reason !== "end_turn") {
      const detail =
        response.stop_reason === "refusal"
          ? (response.stop_details?.category ?? undefined)
          : undefined;
      throw new GenerationStopped(response.stop_reason, detail ?? undefined);
    }

    code = extractCode(textOf(response));
    issues = validateFile(spec.path, code, { paths });
    if (!hasErrors(issues)) {
      return { path: spec.path, code, attempts: attempt, issues, ok: true, usage, model };
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: repairRequest(formatIssues(issues.filter((i) => i.severity === "error"))),
    });
  }

  return { path: spec.path, code, attempts: maxRepairs + 1, issues, ok: false, usage, model };
}
