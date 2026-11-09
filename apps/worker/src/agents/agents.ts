import type Anthropic from "@anthropic-ai/sdk";
import {
  APP_PLAN_JSON_SCHEMA,
  applyAppName,
  BACKEND_CONFIG_FILE,
  backendConfigFile,
  type PlatformConfig,
  buildRouteTree,
  formatIssues,
  hasErrors,
  isScreenFile,
  normalizePlan,
  validateProject,
  type AppPlan,
  type ProjectFiles,
} from "@appbuilder/contract";
import {
  addUsage,
  DEFAULT_MODEL,
  textOf,
  type CreateMessage,
  type UsageTotals,
} from "../generation/client";
import { generateFiles } from "../generation/generate-files";
import { GenerationStopped } from "../generation/generate-file";
import {
  codeSystem,
  editRequest,
  fallbackScreen,
  filesAsContext,
  planRequest,
  planSystem,
  screenRequest,
  sharedLayerRequest,
} from "./prompts";

export class AgentError extends Error {}

const ZERO: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

function sumUsage(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  };
}

export type AgentEvent =
  | { type: "step"; label: string }
  | { type: "file"; path: string; lines: number }
  | { type: "files"; files: ProjectFiles }
  | { type: "warning"; message: string };

export interface ImageInput {
  mediaType: "image/png" | "image/jpeg" | "image/webp" | "image/gif";
  base64: string;
}

// --- Plan ----------------------------------------------------------------------------------

export async function planApp(input: {
  createMessage: CreateMessage;
  prompt: string;
  platforms: string;
  images?: ImageInput[];
  previous?: AppPlan;
  feedback?: string;
  defaultScreens: number;
  maxScreens: number;
  model?: string;
}): Promise<{ plan: AppPlan; fixes: string[]; usage: UsageTotals; model: string }> {
  const model = input.model ?? DEFAULT_MODEL;
  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [
    ...(input.images ?? []).map((image) => ({
      type: "image" as const,
      source: { type: "base64" as const, media_type: image.mediaType, data: image.base64 },
    })),
    { type: "text", text: planRequest(input) },
  ];
  const response = await input.createMessage({
    model,
    max_tokens: 16_000,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: APP_PLAN_JSON_SCHEMA },
    },
    system: planSystem(input.defaultScreens, input.maxScreens),
    messages: [{ role: "user", content }],
  });
  if (response.stop_reason !== "end_turn") throw new GenerationStopped(response.stop_reason);
  let raw: AppPlan;
  try {
    raw = JSON.parse(textOf(response)) as AppPlan;
  } catch {
    throw new AgentError("The planner returned an invalid plan. Please try again.");
  }
  const { plan, fixes } = normalizePlan(raw, { maxScreens: input.maxScreens });
  return { plan, fixes, usage: addUsage(ZERO, response), model };
}

// --- Build ---------------------------------------------------------------------------------

export async function buildApp(input: {
  createMessage: CreateMessage;
  plan: AppPlan;
  template: ProjectFiles;
  /** Platform settings written into data/backend.ts (project id, image endpoint). */
  platform?: PlatformConfig;
  onEvent?: (event: AgentEvent) => Promise<void> | void;
  model?: string;
}): Promise<{ files: ProjectFiles; usage: UsageTotals; model: string; warnings: string[] }> {
  const { createMessage, plan } = input;
  const emit = async (event: AgentEvent) => input.onEvent?.(event);
  const warnings: string[] = [];
  let usage = ZERO;
  let files = applyAppName(input.template, plan.appName);
  if (input.platform)
    files = { ...files, [BACKEND_CONFIG_FILE]: backendConfigFile(input.platform) };

  await emit({ type: "step", label: "Designing themes, data and shared components" });
  const tabsLayout = "app/(tabs)/_layout.tsx";
  const shared = await generateFiles({
    createMessage,
    model: input.model,
    system: codeSystem("The app's platform-owned template files:", filesAsContext(files)),
    request: sharedLayerRequest(plan),
    baseFiles: files,
    expectPaths: ["theme/tokens.ts", "data/schema.ts", "data/seed.ts", tabsLayout],
    onProgress: (e) => (e.type === "file" ? void emit(e) : undefined),
  });
  usage = sumUsage(usage, shared.usage);
  if (!shared.ok) {
    throw new AgentError(
      `Could not generate the app's shared layer:\n${formatIssues(shared.issues)}`,
    );
  }
  files = { ...files, ...shared.files };
  await emit({ type: "files", files });

  // Template + shared layer are identical for every screen call: one cached prefix.
  const screenSystem = codeSystem(
    "The app so far (template + shared layer):",
    filesAsContext(files),
  );
  const screens = plan.screens;
  for (const [index, screen] of screens.entries()) {
    await emit({
      type: "step",
      label: `Building screen ${index + 1} of ${screens.length}: ${screen.title}`,
    });
    try {
      const result = await generateFiles({
        createMessage,
        model: input.model,
        system: screenSystem,
        request: screenRequest(plan, screen, files),
        baseFiles: files,
        expectPaths: [screen.path],
        onProgress: (e) => (e.type === "file" ? void emit(e) : undefined),
      });
      usage = sumUsage(usage, result.usage);
      if (result.ok) {
        files = { ...files, ...result.files };
      } else {
        warnings.push(
          `${screen.title}: ${formatIssues(result.issues.filter((i) => i.severity === "error"))}`,
        );
        files = { ...files, [screen.path]: fallbackScreen(screen.title, screen.path) };
      }
    } catch (error) {
      if (!(error instanceof GenerationStopped)) throw error;
      warnings.push(`${screen.title}: ${error.message}`);
      files = { ...files, [screen.path]: fallbackScreen(screen.title, screen.path) };
    }
    await emit({ type: "files", files });
  }

  for (const warning of warnings) await emit({ type: "warning", message: warning });
  const issues = validateProject(files);
  if (hasErrors(issues))
    throw new AgentError(`The generated app fails validation:\n${formatIssues(issues)}`);
  return { files, usage, model: input.model ?? DEFAULT_MODEL, warnings };
}

// --- Edit ----------------------------------------------------------------------------------

export function countScreens(files: ProjectFiles): number {
  return Object.keys(files).filter(isScreenFile).length;
}

export async function editApp(input: {
  createMessage: CreateMessage;
  files: ProjectFiles;
  request: string;
  selection?: { path: string; snippet: string } | null;
  history?: string[];
  maxScreens: number;
  onEvent?: (event: AgentEvent) => Promise<void> | void;
  model?: string;
}): Promise<{
  files: ProjectFiles;
  changed: string[];
  summary: string;
  usage: UsageTotals;
  model: string;
}> {
  await input.onEvent?.({ type: "step", label: "Reading the app and planning the change" });
  const result = await generateFiles({
    createMessage: input.createMessage,
    model: input.model,
    system: codeSystem("The app's current files:", filesAsContext(input.files)),
    request: editRequest(input),
    baseFiles: input.files,
    onProgress: (e) => (e.type === "file" ? void input.onEvent?.(e) : undefined),
  });
  if (!result.ok) {
    throw new AgentError(
      `The change didn't pass the platform's checks:\n${formatIssues(result.issues)}`,
    );
  }
  const next: ProjectFiles = { ...input.files, ...result.files };
  for (const path of result.deletes) delete next[path];

  if (countScreens(next) > input.maxScreens && countScreens(next) > countScreens(input.files)) {
    throw new AgentError(
      `Your plan allows ${input.maxScreens} screens per app. Upgrade to Pro to add more.`,
    );
  }
  const issues = validateProject(next);
  if (hasErrors(issues))
    throw new AgentError(`The change breaks the app:\n${formatIssues(issues)}`);
  // Routes must still form a valid tree (e.g. no tab removed while the layout lists it).
  buildRouteTree(Object.keys(next));

  const changed = [...Object.keys(result.files), ...result.deletes];
  return {
    files: next,
    changed,
    summary:
      result.summary ??
      (changed.length ? `Updated ${changed.join(", ")}.` : "No changes were needed."),
    usage: result.usage,
    model: result.model,
  };
}
