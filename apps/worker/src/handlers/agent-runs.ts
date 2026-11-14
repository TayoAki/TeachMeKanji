import { join } from "node:path";
import { eq } from "drizzle-orm";
import {
  backendConfigFile,
  mentionedConnectors,
  normalizeResearch,
  readPlatformConfig,
  refreshTemplate,
  type AppPlan,
  type ProjectFiles,
  type ResearchBrief,
} from "@appbuilder/contract";
import { readTree } from "@appbuilder/contract/node";
import {
  addMessage,
  commitVersion,
  confirmPlan,
  connectorAccess,
  errorsForAgent,
  getCurrentFiles,
  getStorage,
  latestPlan,
  listMessages,
  PLANS,
  previewSession,
  repoRoot,
  resolveAppErrors,
  savePlan,
  updateProject,
  userPlan,
} from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import {
  approvedDesignFor,
  approvedMockups,
  DESIGN_BUILD_MODEL,
  DESIGN_REVIEW_MODEL,
} from "../design/build-design";
import { lockEdit } from "../design/edit-lock";
import { withIncludedSupportChat } from "../support-chat";
import { addPromptPictures, matchMockups, matchSummary } from "../design/match-loop";
import { walkthroughApp, walkthroughSummary } from "../walkthrough/walkthrough";
import { researchIdea } from "../design/research";
import { researchForPlanner } from "../design/prompts";
import { platformUrl, withHostedLegalLinks } from "../platform-url";
import {
  AgentError,
  buildApp,
  editApp,
  planApp,
  type AgentEvent,
  type ImageInput,
} from "../agents/agents";
import { readConnectors } from "../agents/connectors";
import type { UsageTotals } from "../generation/client";
import type { HandlerContext, HandlerResult } from "./context";

const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

/** The plan sets up everything after it, so it gets a stronger model than the build. */
const PLAN_MODEL = () => process.env.PLAN_MODEL || "claude-sonnet-5-5";

async function loadProject(ctx: HandlerContext) {
  const [project] = await ctx.db
    .select()
    .from(schema.project)
    .where(eq(schema.project.id, ctx.run.projectId));
  if (!project) throw new AgentError("Project not found");
  return project;
}

async function loadImages(ctx: HandlerContext, assetIds: string[]): Promise<ImageInput[]> {
  if (assetIds.length === 0) return [];
  const rows = await ctx.db
    .select()
    .from(schema.projectAsset)
    .where(eq(schema.projectAsset.projectId, ctx.run.projectId));
  const images: ImageInput[] = [];
  for (const asset of rows.filter((r) => assetIds.includes(r.id) && IMAGE_TYPES.has(r.mime))) {
    const object = await getStorage().get(asset.storageKey);
    if (object)
      images.push({
        mediaType: asset.mime as ImageInput["mediaType"],
        base64: object.data.toString("base64"),
      });
  }
  return images;
}

async function maxScreens(ctx: HandlerContext): Promise<number> {
  return PLANS[await userPlan(ctx.db, ctx.run.userId)].maxScreensPerProject;
}

const NO_USAGE: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

/**
 * AI features (askAI/useAI from data/ai) run through App Cloud, so a version that starts using
 * them turns App Cloud on in the same step: the app works in the preview and on phones at once.
 */
async function withAppCloudForAi(
  ctx: HandlerContext,
  project: { id: string; backend: string },
  files: ProjectFiles,
): Promise<{ files: ProjectFiles; enabled: boolean }> {
  const usesAi = Object.entries(files).some(
    ([path, source]) => path !== "data/ai.ts" && /from\s+["'][./]*data\/ai["']/.test(source),
  );
  if (!usesAi || project.backend === "cloud") return { files, enabled: false };
  const apiUrl = platformUrl();
  await ctx.db
    .update(schema.project)
    .set({ backend: "cloud" })
    .where(eq(schema.project.id, project.id));
  return {
    files: {
      ...files,
      "data/backend.ts": backendConfigFile({
        apiUrl,
        projectId: project.id,
        imageEndpoint: readPlatformConfig(files).imageEndpoint,
      }),
    },
    enabled: true,
  };
}

const APP_CLOUD_FOR_AI_NOTE =
  "App Cloud is now on: the app's AI features run through it, paid from your credits (a fraction of a credit per answer).";

function sumUsage(a: UsageTotals, b: UsageTotals): UsageTotals {
  return {
    input: a.input + b.input,
    output: a.output + b.output,
    cacheRead: a.cacheRead + b.cacheRead,
    cacheWrite: a.cacheWrite + b.cacheWrite,
  };
}

/**
 * When the message names connectors (Linear, Notion, Mobbin…), read what it refers to from the
 * user's own accounts first. Never fails the run: problems become notes for the chat.
 */
async function readNamedConnectors(
  ctx: HandlerContext,
  text: string,
  about: string,
): Promise<{ brief?: string; usage: UsageTotals; notes: string[] }> {
  const ids = mentionedConnectors(text);
  if (!ids.length) return { usage: NO_USAGE, notes: [] };
  const { connectors, problems } = await connectorAccess(ctx.db, ctx.run.userId, ids);
  const notes = [...problems];
  if (!connectors.length) return { usage: NO_USAGE, notes };
  const names = connectors.map((c) => c.name).join(" and ");
  await ctx.emit("step", { label: `Reading ${names}` });
  try {
    const read = await readConnectors({
      createMessage: ctx.createMessage,
      model: ctx.model,
      connectors,
      request: text,
      about,
    });
    if (read.brief) notes.unshift(`Read from ${names}.`);
    return { brief: read.brief || undefined, usage: read.usage, notes };
  } catch (error) {
    notes.push(
      `I couldn't read from ${names} (${(error as Error).message.slice(0, 200)}), so I went ahead without it.`,
    );
    return { usage: NO_USAGE, notes };
  }
}

function forwardAgentEvent(ctx: HandlerContext) {
  return async (event: AgentEvent) => {
    if (event.type === "files") await ctx.emit("files", { files: event.files });
    else if (event.type === "file")
      await ctx.emit("file", { path: event.path, lines: event.lines });
    else if (event.type === "step") await ctx.emit("step", { label: event.label });
    else await ctx.emit("warning", { message: event.message });
  };
}

export async function handlePlan(ctx: HandlerContext): Promise<HandlerResult> {
  const project = await loadProject(ctx);
  const input = ctx.run.input as { feedback?: string; assetIds?: string[] };
  const previous = input.feedback ? await latestPlan(ctx.db, project.id) : null;
  await updateProject(ctx.db, project.id, { status: "planning" });
  await ctx.emit("step", {
    label: previous ? "Revising the plan" : "Understanding your idea and drafting a plan",
  });

  const connectors = await readNamedConnectors(
    ctx,
    previous ? (input.feedback ?? "") : project.prompt,
    previous ? "changes to their app's plan" : "a new app idea",
  );
  // A first plan starts from what the web says about the idea; a revision reuses that research.
  let research: ResearchBrief | null = previous ? normalizeResearch(previous.research) : null;
  let researchUsage: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  if (!previous && process.env.RESEARCH !== "0") {
    await ctx.emit("step", { label: "Researching similar apps and what their users say" });
    const found = await researchIdea({
      createMessage: ctx.createMessage,
      idea: project.prompt,
      model: ctx.offline ? ctx.model : undefined,
    });
    research = found.research;
    researchUsage = found.usage;
    await ctx.emit("step", { label: "Drafting the plan" });
  }
  const result = await planApp({
    createMessage: ctx.createMessage,
    model: ctx.offline ? ctx.model : PLAN_MODEL(),
    prompt: project.prompt,
    platforms: project.platforms,
    images: await loadImages(ctx, input.assetIds ?? []),
    previous: previous ? (previous.data as unknown as AppPlan) : undefined,
    feedback: input.feedback,
    connectorBrief: connectors.brief,
    research: research ? researchForPlanner(research) : undefined,
    defaultScreens: Number(process.env.DEFAULT_SCREEN_COUNT || 3),
    maxScreens: await maxScreens(ctx),
  });

  const saved = await savePlan(
    ctx.db,
    project.id,
    result.plan,
    research as unknown as Record<string, unknown> | null,
  );
  if (connectors.notes.length)
    await addMessage(ctx.db, {
      projectId: project.id,
      role: "assistant",
      runId: ctx.run.id,
      content: { text: connectors.notes.join(" ") },
    });
  await addMessage(ctx.db, {
    projectId: project.id,
    role: "assistant",
    kind: "plan",
    runId: ctx.run.id,
    content: { planId: saved.id, number: saved.number, plan: result.plan },
  });
  await updateProject(ctx.db, project.id, {
    status: "awaiting_confirmation",
    ...(previous ? {} : { name: result.plan.appName }),
  });
  return {
    output: { planId: saved.id, researched: Boolean(research) },
    usage: sumUsage(sumUsage(connectors.usage, result.usage), researchUsage),
  };
}

export async function handleBuild(ctx: HandlerContext): Promise<HandlerResult> {
  const project = await loadProject(ctx);
  const planRow = await latestPlan(ctx.db, project.id);
  if (!planRow) throw new AgentError("There is no plan to build yet.");
  const plan = planRow.data as unknown as AppPlan;
  await confirmPlan(ctx.db, planRow.id);
  await updateProject(ctx.db, project.id, { status: "building" });

  const template = await readTree(join(repoRoot(), "templates/expo-app"));
  // Approved mockups carry the design, so a cheaper model can write the code (offline: the same).
  const approved = await approvedDesignFor(ctx.db, project.id, planRow.id);
  if (approved) await ctx.emit("step", { label: "Building from your approved mockups" });
  const built = await buildApp({
    createMessage: ctx.createMessage,
    model: approved && !ctx.offline ? DESIGN_BUILD_MODEL() : ctx.model,
    plan,
    template,
    platform: {
      apiUrl: "",
      projectId: project.id,
      imageEndpoint: process.env.IMAGEKIT_URL_ENDPOINT || "",
    },
    onEvent: forwardAgentEvent(ctx),
    design: approved?.design,
  });

  const cloud = await withAppCloudForAi(
    ctx,
    project,
    withHostedLegalLinks(built.files, project.id),
  );
  // Pictures the screens describe (<AiImage prompt="...">) are drawn now, not left as grey boxes.
  // Paid plans include the Hire Shelby support chat (switched on here unless the owner said no).
  const files = await withIncludedSupportChat(
    ctx.db,
    project,
    await addPromptPictures(ctx, project.id, cloud.files, approved?.design.style),
  );
  let version = await commitVersion(ctx.db, {
    projectId: project.id,
    files,
    kind: "generate",
    summary: `Built ${plan.screens.length} screens from plan ${planRow.number}`,
    runId: ctx.run.id,
    createdBy: ctx.run.userId,
  });
  const themeId = project.activeThemeId ?? plan.themes[0]?.id;
  await updateProject(ctx.db, project.id, { status: "ready", activeThemeId: themeId });
  // Renders and tests use the preview user's sample data for App Cloud apps.
  const storage: Record<string, string> =
    cloud.enabled || project.backend === "cloud"
      ? { "app:auth:token": await previewSession(ctx.db, project.id) }
      : {};

  // Built from mockups: check every screen against its mockup and rebuild the ones that miss.
  const match = approved
    ? await matchMockups(ctx, {
        projectId: project.id,
        plan,
        files,
        design: approved.design,
        themeId,
        buildModel: ctx.offline ? ctx.model : DESIGN_BUILD_MODEL(),
        reviewModel: ctx.offline ? ctx.model : DESIGN_REVIEW_MODEL(),
        versionId: version.id,
        template,
        settleMs: ctx.offline ? 150 : undefined,
        storage,
      })
    : null;
  if (match?.versionId && match.versionId !== version.id)
    version = { ...version, id: match.versionId };

  // Use the app like a person would before handing it over, and fix what doesn't work.
  const tested = await walkthroughApp(ctx, {
    plan,
    files: match?.files ?? files,
    themeId,
    storage,
    buildModel: ctx.offline ? ctx.model : approved ? DESIGN_BUILD_MODEL() : ctx.model,
  });
  // A repair that added AI to the app gets App Cloud, like the build itself.
  const repairedCloud = tested?.repaired
    ? await withAppCloudForAi(ctx, project, tested.files)
    : null;
  if (tested && repairedCloud)
    version = await commitVersion(ctx.db, {
      projectId: project.id,
      files: repairedCloud.files,
      kind: "ai_edit",
      summary: `Fixed what testing the app found: ${tested.cases
        .filter((c) => c.fixed)
        .map((c) => c.title)
        .join(", ")}`,
      runId: ctx.run.id,
      createdBy: ctx.run.userId,
    });
  const screenList = plan.screens.map((s) => s.title).join(", ");
  await addMessage(ctx.db, {
    projectId: project.id,
    role: "assistant",
    runId: ctx.run.id,
    content: {
      text: `${plan.appName} is ready: ${screenList}.${built.warnings.length ? ` ${built.warnings.length} screen(s) need another try; ask me to regenerate them.` : ""}${match ? ` ${matchSummary(match)}` : ""}${
        tested
          ? ` ${walkthroughSummary(tested)}`
          : process.env.WALKTHROUGH === "0"
            ? ""
            : " This server can't run the app in a browser, so this build wasn't tested."
      } Switch themes on the right, click any element to edit it, or tell me what to change.${cloud.enabled ? ` ${APP_CLOUD_FOR_AI_NOTE}` : ""}`,
      versionId: version.id,
      ...(match ? { match: match.screens } : {}),
      ...(tested?.cases.length
        ? {
            test: tested.cases.map(({ title, status, observed, fixed }) => ({
              title,
              status,
              observed,
              ...(fixed ? { fixed } : {}),
            })),
          }
        : {}),
    },
  });
  return {
    output: {
      versionId: version.id,
      warnings: built.warnings,
      ...(match ? { match: { rounds: match.rounds, screens: match.screens } } : {}),
      ...(tested ? { test: { repaired: tested.repaired, cases: tested.cases } } : {}),
    },
    usage: built.usage,
  };
}

export async function handleEdit(ctx: HandlerContext): Promise<HandlerResult> {
  const project = await loadProject(ctx);
  const input = ctx.run.input as {
    request: string;
    selection?: { path: string; snippet: string; kind?: "element" | "screen" } | null;
    /** Reported errors the user asked to fix ("Fix with AI" in the Errors tab). */
    errorIds?: string[];
  };
  const current = await getCurrentFiles(ctx.db, project.id);
  // Projects made with an older template get the current platform files before editing.
  // Apps made before the hosted privacy policy get their empty Privacy and Terms links filled.
  const files = withHostedLegalLinks(
    refreshTemplate(current.files, await readTree(join(repoRoot(), "templates/expo-app"))),
    project.id,
  );
  if (!current.versionId) throw new AgentError("Build the app before editing it.");

  const history = (await listMessages(ctx.db, project.id))
    .filter((m) => m.kind === "text" && typeof m.content.text === "string")
    .slice(-7, -1)
    .map((m) => `${m.role}: ${String(m.content.text).slice(0, 300)}`);

  const connectors = await readNamedConnectors(
    ctx,
    input.request,
    input.selection?.kind === "screen"
      ? `a change to the ${input.selection.path} screen of their app`
      : "a change to their app",
  );
  const result = await editApp({
    createMessage: ctx.createMessage,
    model: ctx.editModel,
    files,
    request: input.request,
    selection: input.selection ?? null,
    history,
    maxScreens: await maxScreens(ctx),
    connectorBrief: connectors.brief,
    appErrors: (await errorsForAgent(ctx.db, project.id))?.brief,
    onEvent: forwardAgentEvent(ctx),
  });

  // The regression lock: the rest of the app must still render, and screens built from approved
  // mockups the request wasn't about must still match them.
  const planRow = await latestPlan(ctx.db, project.id);
  const plan = planRow ? (planRow.data as unknown as AppPlan) : null;
  const locked =
    result.changed.length > 0
      ? await lockEdit(ctx, {
          request: input.request,
          before: files,
          after: result.files,
          changed: result.changed,
          selected: input.selection?.path ?? null,
          plan,
          mockups: planRow ? await approvedMockups(ctx.db, project.id, planRow.id) : undefined,
          themeId: project.activeThemeId ?? plan?.themes[0]?.id,
          storage:
            project.backend === "cloud"
              ? { "app:auth:token": await previewSession(ctx.db, project.id) }
              : {},
          buildModel: ctx.editModel,
          reviewModel: ctx.offline ? ctx.model : DESIGN_REVIEW_MODEL(),
        })
      : null;
  if (locked) {
    result.files = locked.files;
    result.changed = locked.changed;
  }

  let versionId: string | null = null;
  // Only a change that's saved can switch App Cloud on (it's turned on with the version).
  const cloud =
    result.changed.length > 0
      ? await withAppCloudForAi(ctx, project, result.files)
      : { files: result.files, enabled: false };
  if (cloud.enabled) connectors.notes.push(APP_CLOUD_FOR_AI_NOTE);
  if (result.changed.length > 0) {
    const version = await commitVersion(ctx.db, {
      projectId: project.id,
      files: cloud.files,
      kind: "ai_edit",
      summary: result.summary.slice(0, 200),
      runId: ctx.run.id,
      createdBy: ctx.run.userId,
    });
    versionId = version.id;
    await ctx.emit("files", { files: cloud.files });
    // The errors the user asked to fix are fixed now; a new report would reopen them.
    if (input.errorIds?.length) await resolveAppErrors(ctx.db, project.id, input.errorIds);
  }
  await addMessage(ctx.db, {
    projectId: project.id,
    role: "assistant",
    runId: ctx.run.id,
    content: {
      text: [result.summary, ...(locked?.notes ?? []), ...connectors.notes].join("\n\n"),
      changed: result.changed,
      versionId,
      // Undo goes back to the version before this edit (and refunds it within a day).
      undoVersionId: versionId ? current.versionId : null,
    },
  });
  return {
    output: {
      versionId,
      changed: result.changed,
      ...(locked?.report
        ? {
            checked: locked.report.checked,
            alsoChanged: locked.report.alsoChanged,
            drifted: locked.report.drifted,
          }
        : {}),
    },
    usage: sumUsage(connectors.usage, result.usage),
  };
}
