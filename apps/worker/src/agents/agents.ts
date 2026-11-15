import type Anthropic from "@anthropic-ai/sdk";
import {
  APP_INFO_FILE,
  APP_PLAN_JSON_SCHEMA,
  appImagesFile,
  appInfoFile,
  IMAGES_FILE,
  applyAppName,
  withAppIdentifiers,
  BACKEND_CONFIG_FILE,
  backendConfigFile,
  type PlatformConfig,
  buildRouteTree,
  countLimitedScreens,
  formatIssues,
  hasErrors,
  MONETIZATION_FILE,
  monetizationFile,
  normalizePlan,
  validateProject,
  withAppStructure,
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
import { modelSeesImages } from "../generation/openrouter-chat";
import { GenerationStopped } from "../generation/generate-file";
import {
  codeSystem,
  editRequest,
  fallbackScreen,
  filesAsContext,
  planRequest,
  planSystem,
  dataLayerRequest,
  screenComponentDir,
  screenFromBrief,
  screenFromMockup,
  screenMotion,
  screenRequest,
  themeFromBrief,
  themeFromMockup,
  themeRequest,
  withMockup,
  type BuildDesign,
} from "./prompts";
import { fanOut } from "../generation/fan-out";

/** How many screens are generated at once (each is one streaming model call). */
const GENERATION_CONCURRENCY = Math.max(1, Number(process.env.GENERATION_CONCURRENCY || 8));

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
  connectorBrief?: string;
  /** Web research for the idea, condensed for the planner (researchForPlanner). */
  research?: string;
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
  /** Approved mockups (design-first builds): the theme and every screen follow them. */
  design?: BuildDesign;
}): Promise<{ files: ProjectFiles; usage: UsageTotals; model: string; warnings: string[] }> {
  const { createMessage, design } = input;
  // Plans saved before the four-part structure get their onboarding, paywall and settings here.
  const plan = normalizePlan(input.plan, { maxScreens: Number.MAX_SAFE_INTEGER }).plan;
  const emit = async (event: AgentEvent) => input.onEvent?.(event);
  const warnings: string[] = [];
  let usage = ZERO;
  let files = applyAppName(input.template, plan.appName);
  if (input.platform) {
    files = { ...files, [BACKEND_CONFIG_FILE]: backendConfigFile(input.platform) };
    // Store identifiers (iOS bundle id, Android package) for store builds and RevenueCat.
    files = withAppIdentifiers(files, input.platform.projectId);
  }
  // What premium unlocks and the app's info come straight from the plan, not from the model.
  files = {
    ...files,
    [MONETIZATION_FILE]: monetizationFile(plan.monetization),
    [APP_INFO_FILE]: appInfoFile({
      name: plan.appName,
      version: "1.0.0",
      supportEmail: "",
      privacyUrl: "",
      termsUrl: "",
    }),
  };
  if (design?.images && Object.keys(design.images).length > 0)
    files = { ...files, [IMAGES_FILE]: appImagesFile(design.images) };
  // The theme follows the mockup of the main screen.
  const mainPath =
    plan.screens.find((s) => s.path === "app/(tabs)/index.tsx")?.path ?? plan.screens[0]?.path;
  const keyMockup = design && mainPath ? design.mockups[mainPath] : undefined;
  // A model that reads text only builds from the mockups' written briefs and the design's style.
  const textOnly = Boolean(design) && !modelSeesImages(input.model ?? DEFAULT_MODEL);
  const themeStep = (): string | ReturnType<typeof withMockup> => {
    if (textOnly && design?.style)
      return `${themeRequest(plan)}\n\n${themeFromBrief(plan, design.style)}`;
    if (!textOnly && keyMockup)
      return withMockup(`${themeRequest(plan)}\n\n${themeFromMockup(plan)}`, keyMockup);
    return themeRequest(plan);
  };
  const screenStep = (
    screen: AppPlan["screens"][number],
  ): string | ReturnType<typeof withMockup> => {
    const brief = design?.briefs?.[screen.path];
    const motion = screenMotion(design?.motion, screen.path);
    const withMotion = (text: string) => (motion ? `${text}\n\n${motion}` : text);
    if (textOnly && brief)
      return withMotion(
        `${screenRequest(plan, screen)}\n\n${screenFromBrief(brief, design?.images)}`,
      );
    const mockup = design?.mockups[screen.path];
    if (!textOnly && mockup)
      return withMockup(
        withMotion(`${screenRequest(plan, screen)}\n\n${screenFromMockup(design?.images)}`),
        mockup,
      );
    return withMotion(screenRequest(plan, screen));
  };

  // 1. Shared layer: the theme and the data layer are independent, so they run in parallel.
  await emit({ type: "step", label: "Designing the theme, data and shared components" });
  const sharedSystem = codeSystem(
    "The app's platform-owned template files:",
    filesAsContext(files),
  );
  const tabsLayout = "app/(tabs)/_layout.tsx";
  const sharedParts = [
    {
      request: themeStep(),
      expectPaths: ["theme/tokens.ts"],
      allowWrite: {
        test: (path: string) => path === "theme/tokens.ts",
        describe: "theme/tokens.ts may be written",
      },
    },
    {
      request: dataLayerRequest(plan),
      expectPaths: ["data/schema.ts", "data/seed.ts", tabsLayout],
      allowWrite: {
        test: (path: string) =>
          path === "data/schema.ts" ||
          path === "data/seed.ts" ||
          path === tabsLayout ||
          /^components\/[^/]+\.tsx?$/.test(path),
        describe:
          "data/schema.ts, data/seed.ts, app/(tabs)/_layout.tsx and components/*.tsx may be written",
      },
    },
  ];
  const shared = await fanOut(sharedParts, sharedParts.length, (part, _index, onStreamStart) =>
    generateFiles({
      createMessage,
      model: input.model,
      system: sharedSystem,
      request: part.request,
      baseFiles: files,
      expectPaths: part.expectPaths,
      allowWrite: part.allowWrite,
      onStreamStart,
      onProgress: (e) => (e.type === "file" ? void emit(e) : undefined),
    }),
  );
  for (const result of shared) usage = sumUsage(usage, result.usage);
  const sharedFailures = shared.filter((result) => !result.ok);
  if (sharedFailures.length > 0) {
    throw new AgentError(
      `Could not generate the app's shared layer:\n${sharedFailures.map((r) => formatIssues(r.issues)).join("\n")}`,
    );
  }
  for (const result of shared) files = { ...files, ...result.files };
  files = withPlanDefaultTheme(files, plan);
  await emit({ type: "files", files });

  // 2. Screens, in parallel. They share one cached prefix (template + shared layer); each
  // writes only its own screen and components in its own folder, so they can't collide.
  const screenSystem = codeSystem(
    "The app so far (template + shared layer):",
    filesAsContext(files),
  );
  const sharedFiles = files;
  const screens = plan.screens;
  await emit({
    type: "step",
    label:
      screens.length === 1
        ? `Building ${screens[0]!.title}`
        : `Building ${screens.length} screens at once`,
  });
  let built = 0;
  await fanOut(screens, GENERATION_CONCURRENCY, async (screen, _index, onStreamStart) => {
    const dir = screenComponentDir(screen);
    let screenFiles: ProjectFiles;
    try {
      const result = await generateFiles({
        createMessage,
        model: input.model,
        system: screenSystem,
        request: screenStep(screen),
        baseFiles: sharedFiles,
        expectPaths: [screen.path],
        allowWrite: {
          test: (path) => path === screen.path || path.startsWith(dir),
          describe: `${screen.path} and a new component in ${dir} may be written`,
        },
        onStreamStart,
        onProgress: (e) => (e.type === "file" ? void emit(e) : undefined),
      });
      usage = sumUsage(usage, result.usage);
      if (result.ok) {
        screenFiles = result.files;
      } else {
        warnings.push(
          `${screen.title}: ${formatIssues(result.issues.filter((i) => i.severity === "error"))}`,
        );
        screenFiles = { [screen.path]: fallbackScreen(screen.title, screen.path) };
      }
    } catch (error) {
      if (!(error instanceof GenerationStopped)) throw error;
      warnings.push(`${screen.title}: ${error.message}`);
      screenFiles = { [screen.path]: fallbackScreen(screen.title, screen.path) };
    }
    // Screens appear on the canvas as each one finishes.
    files = { ...files, ...screenFiles };
    built += 1;
    await emit({ type: "files", files });
    await emit({ type: "step", label: `Built ${built} of ${screens.length} screens` });
  });

  for (const warning of warnings) await emit({ type: "warning", message: warning });
  files = withAppStructure(files);
  const issues = validateProject(files);
  if (hasErrors(issues))
    throw new AgentError(`The generated app fails validation:\n${formatIssues(issues)}`);
  return { files, usage, model: input.model ?? DEFAULT_MODEL, warnings };
}

/**
 * The app opens in the plan's first theme (the one its mockups use). The model sometimes picks
 * another pack as the default; the platform sets it instead of trusting that.
 */
export function withPlanDefaultTheme(files: ProjectFiles, plan: AppPlan): ProjectFiles {
  const id = plan.themes[0]?.id;
  const tokens = files["theme/tokens.ts"];
  if (!id || !tokens || !tokens.includes(`"${id}"`)) return files;
  const fixed = tokens.replace(
    /export const defaultThemeId(?:\s*:\s*\w+)?\s*=\s*["'][^"']*["']/,
    `export const defaultThemeId = "${id}"`,
  );
  return fixed === tokens ? files : { ...files, "theme/tokens.ts": fixed };
}

// --- Edit ----------------------------------------------------------------------------------

/** Screens that count toward the plan's limit (onboarding, paywall and settings don't). */
export function countScreens(files: ProjectFiles): number {
  return countLimitedScreens(files);
}

export async function editApp(input: {
  createMessage: CreateMessage;
  files: ProjectFiles;
  request: string;
  selection?: { path: string; snippet: string; kind?: "element" | "screen" } | null;
  history?: string[];
  maxScreens: number;
  connectorBrief?: string;
  appErrors?: string;
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
  let next: ProjectFiles = { ...input.files, ...result.files };
  for (const path of result.deletes) delete next[path];
  next = withAppStructure(next);

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
