import type Anthropic from "@anthropic-ai/sdk";
import {
  formatIssues,
  hasErrors,
  isTemplateFile,
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
import { parseFileBlocks } from "./files";
import { GenerationStopped } from "./generate-file";

export interface GenerateFilesResult {
  /** Files written by the model in this call (validated). */
  files: ProjectFiles;
  deletes: string[];
  summary: string | null;
  issues: Issue[];
  ok: boolean;
  attempts: number;
  usage: UsageTotals;
  model: string;
}

export interface GenerateFilesOptions {
  createMessage: CreateMessage;
  system: Anthropic.Beta.Messages.BetaTextBlockParam[];
  /** The request; may include images. */
  request: Anthropic.Beta.Messages.BetaContentBlockParam[] | string;
  /** The project before this call, used to resolve imports and check required files. */
  baseFiles: ProjectFiles;
  /** Paths the model is expected to write (missing ones are reported as errors). */
  expectPaths?: string[];
  /** Paths the model must never write. */
  allowTemplateWrites?: boolean;
  /**
   * The only paths this call may write, when calls run in parallel and must not touch each
   * other's files. Writes elsewhere are reported for repair.
   */
  allowWrite?: { test: (path: string) => boolean; describe: string };
  /** Called once when the first response starts streaming (its prompt is then cached). */
  onStreamStart?: () => void;
  maxRepairs?: number;
  model?: string;
  effort?: "low" | "medium" | "high" | "xhigh" | "max";
  onProgress?: (
    event: { type: "attempt"; attempt: number } | { type: "file"; path: string; lines: number },
  ) => void;
}

/**
 * Ask for one or more files in the <file> protocol, validate every file written, and send
 * failures back for repair (append-only conversation). Later attempts only need to resend
 * the files that failed; earlier valid files are kept.
 */
export async function generateFiles(options: GenerateFilesOptions): Promise<GenerateFilesResult> {
  const {
    createMessage,
    system,
    baseFiles,
    expectPaths = [],
    maxRepairs = 2,
    model = DEFAULT_MODEL,
    effort = DEFAULT_EFFORT,
  } = options;
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    { role: "user", content: options.request },
  ];

  let usage: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const written: ProjectFiles = {};
  const deletes = new Set<string>();
  let summary: string | null = null;
  let issues: Issue[] = [];

  for (let attempt = 1; attempt <= maxRepairs + 1; attempt++) {
    options.onProgress?.({ type: "attempt", attempt });
    const response = await createMessage(
      {
        model,
        max_tokens: 64_000,
        output_config: { effort },
        system,
        messages,
      },
      // Repairs fix files that failed the platform's checks: the user doesn't pay for them.
      attempt === 1 ? { onStreamStart: options.onStreamStart } : { free: true },
    );
    usage = addUsage(usage, response);
    if (response.stop_reason !== "end_turn") {
      const detail =
        response.stop_reason === "refusal"
          ? (response.stop_details?.category ?? undefined)
          : undefined;
      throw new GenerationStopped(response.stop_reason, detail ?? undefined);
    }

    const parsed = parseFileBlocks(textOf(response));
    summary = parsed.summary ?? summary;
    for (const path of parsed.deletes) deletes.add(path);
    const outOfScope: string[] = [];
    for (const [path, content] of Object.entries(parsed.files)) {
      if (isTemplateFile(path) && !options.allowTemplateWrites) continue; // platform-owned
      if (options.allowWrite && !options.allowWrite.test(path)) {
        outOfScope.push(path); // dropped: another parallel step owns it
        continue;
      }
      written[path] = content;
      deletes.delete(path);
      options.onProgress?.({ type: "file", path, lines: content.split("\n").length });
    }

    const project: ProjectFiles = { ...baseFiles, ...written };
    for (const path of deletes) delete project[path];
    const paths = new Set(Object.keys(project));

    issues = outOfScope.map((path) => ({
      path,
      rule: "generation/outside-scope",
      severity: "error" as const,
      message: `Don't write ${path} in this step (it was discarded). Only ${options.allowWrite!.describe}.`,
    }));
    for (const path of expectPaths) {
      if (!(path in written)) {
        issues.push({
          path,
          rule: "generation/missing-file",
          severity: "error",
          message: `You did not write ${path}.`,
        });
      }
    }
    for (const [path, content] of Object.entries(written)) {
      if (deletes.has(path)) continue;
      issues.push(...validateFile(path, content, { paths }));
    }
    // Untouched files must still resolve their imports (e.g. after a delete or rename).
    if (deletes.size > 0) {
      for (const [path, content] of Object.entries(project)) {
        if (path in written || !/\.tsx?$/.test(path)) continue;
        for (const issue of validateFile(path, content, { paths })) {
          if (issue.rule === "imports/relative") {
            issues.push({
              ...issue,
              message: `${issue.message} Update ${path} too, or don't delete what it imports.`,
            });
          }
        }
      }
    }

    if (!hasErrors(issues)) {
      return {
        files: written,
        deletes: [...deletes],
        summary,
        issues,
        ok: true,
        attempts: attempt,
        usage,
        model,
      };
    }

    messages.push({ role: "assistant", content: response.content });
    messages.push({
      role: "user",
      content: `These files fail the platform's checks:\n\n${formatIssues(issues.filter((i) => i.severity === "error"))}\n\nRespond with corrected <file> blocks (complete contents) for every file that needs to change. Files you already wrote correctly are kept.`,
    });
  }

  return {
    files: written,
    deletes: [...deletes],
    summary,
    issues,
    ok: false,
    attempts: maxRepairs + 1,
    usage,
    model,
  };
}
