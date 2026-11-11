/**
 * Promo videos of the app (the Sizzle Product Film method, automated):
 * - promo_storyboard writes the board: a text hook, the screens in story order with one caption
 *   and a camera focus each, a tagline and one truthful call to action. The owner edits it in
 *   the builder before anything is rendered (a board is cheap to change; a render isn't).
 * - promo_render films the approved board from the screens the builder captured from the app's
 *   own preview, with Remotion, and stores the MP4 and its poster frame.
 */
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { and, desc, eq } from "drizzle-orm";
import {
  isPromoFormat,
  normalizePromoColors,
  normalizeStoryboard,
  PROMO_DEFAULT_CTA,
  PROMO_LIMITS,
  PROMO_STORYBOARD_JSON_SCHEMA,
  promoProblems,
  promoScreens,
  readAppDataPractices,
  type AppPlan,
  type PromoStoryboard,
  type StoreListing,
} from "@appbuilder/contract";
import { getCurrentFiles, getStorage, latestPlan, reportError } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { AgentError } from "../agents/agents";
import { addUsage, textOf } from "../generation/client";
import type { HandlerContext, HandlerResult } from "./context";

export const PROMO_STORYBOARD_SYSTEM = `You storyboard short promo videos of mobile apps, made from the app's real screens: a Product Film with no presenter, where the product is the star. It must read with the sound off, at phone size in a feed.

The film: the first screen is on screen from frame 0 with a text hook above it; each beat shows one screen whole, then the camera pushes in on its focus while a caption names one benefit; one pull-back shows every screen side by side; it closes on the app's name, a tagline and one call to action.

Write:
- hook: 3 to 7 words, at most ${PROMO_LIMITS.hook} characters. The outcome the audience wants, in their words, not the app's name and not a question about features.
- beats: ${PROMO_LIMITS.minBeats + 1} or 4 screens (never more than ${PROMO_LIMITS.maxBeats}), in story order. Open on the app's most visual, useful screen, never an empty state, onboarding or settings. Escalate, and end on the payoff: the densest, most satisfying thing the app makes (progress, results, a finished item). Each caption: one benefit, at most ${PROMO_LIMITS.caption} characters and about 6 words, plain language, using the app's own names for things. focus: where that screen's key content sits (top, middle or bottom third).
- tagline: at most ${PROMO_LIMITS.tagline} characters, the promise in one line.
- cta: at most ${PROMO_LIMITS.cta} characters. Only claims that are true: don't say the app is in the App Store or Google Play, free, or any price unless the brief says so; "${PROMO_DEFAULT_CTA}" is the safe default.

Never invent user counts, ratings, awards, "#1" or "best", speed claims or features the screens don't show.`;

/** The listing the last successful store_listing run wrote, for consistent copy. */
async function latestListing(ctx: HandlerContext): Promise<StoreListing | null> {
  const [row] = await ctx.db
    .select({ output: schema.agentRun.output })
    .from(schema.agentRun)
    .where(
      and(
        eq(schema.agentRun.projectId, ctx.run.projectId),
        eq(schema.agentRun.kind, "store_listing"),
        eq(schema.agentRun.status, "succeeded"),
      ),
    )
    .orderBy(desc(schema.agentRun.createdAt))
    .limit(1);
  return ((row?.output as { listing?: StoreListing } | null)?.listing ?? null) || null;
}

export async function handlePromoStoryboard(ctx: HandlerContext): Promise<HandlerResult> {
  const { versionId, files } = await getCurrentFiles(ctx.db, ctx.run.projectId);
  if (!versionId) throw new AgentError("Build the app first.");
  const plan = (await latestPlan(ctx.db, ctx.run.projectId))?.data as AppPlan | undefined;
  const listing = await latestListing(ctx);
  const screens = promoScreens(Object.keys(files));
  if (screens.length < PROMO_LIMITS.minBeats)
    throw new AgentError("The app needs at least two screens to make a promo video.");
  const brief = plan
    ? {
        appName: plan.appName,
        summary: plan.summary,
        audience: plan.audience,
        angle: plan.angle,
        coreLoop: plan.coreLoop,
        shareMoment: plan.shareMoment,
        screens: plan.screens.map((s) => ({ path: s.path, title: s.title, purpose: s.purpose })),
      }
    : { appName: readAppDataPractices(files).appName };

  await ctx.emit("step", { label: "Writing the storyboard" });
  const response = await ctx.createMessage({
    model: ctx.editModel,
    max_tokens: 4_000,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: PROMO_STORYBOARD_JSON_SCHEMA },
    },
    system: PROMO_STORYBOARD_SYSTEM,
    messages: [
      {
        role: "user",
        content: `The app:\n${JSON.stringify(brief, null, 2)}${listing ? `\n\nIts store listing (keep the copy consistent): ${JSON.stringify({ name: listing.name, subtitle: listing.subtitle, promotionalText: listing.promotionalText, captions: listing.screenshots })}` : ""}\n\nScreens you can use (these paths exactly): ${screens.join(", ")}\n\nThe main home screen's code:\n${(files["app/(tabs)/index.tsx"] ?? "").slice(0, 6000)}`,
      },
    ],
  });
  if (response.stop_reason !== "end_turn")
    throw new AgentError("The storyboard couldn't be written. Try again.");
  let raw: unknown;
  try {
    raw = JSON.parse(textOf(response));
  } catch {
    throw new AgentError("The storyboard came back malformed. Try again.");
  }
  const storyboard = normalizeStoryboard(raw, screens);
  if (storyboard.beats.length < PROMO_LIMITS.minBeats)
    throw new AgentError("The storyboard didn't use the app's screens. Try again.");
  return {
    output: { storyboard, versionId },
    usage: addUsage({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, response),
  };
}

interface RenderInput {
  storyboard: PromoStoryboard;
  format: string;
  colors: Record<string, string>;
  /** Stored captures of the beats' screens, in beat order. */
  shots: string[];
  music: { key: string; extension: string } | null;
}

export async function handlePromoRender(ctx: HandlerContext): Promise<HandlerResult> {
  const input = ctx.run.input as unknown as RenderInput;
  if (!isPromoFormat(input.format)) throw new AgentError("Pick a video format.");
  const { versionId, files } = await getCurrentFiles(ctx.db, ctx.run.projectId);
  if (!versionId) throw new AgentError("Build the app first.");
  const storyboard = normalizeStoryboard(input.storyboard, promoScreens(Object.keys(files)));
  const problems = promoProblems(storyboard);
  if (problems.length) throw new AgentError(problems[0]!);
  if (input.shots.length !== storyboard.beats.length)
    throw new AgentError("A screen of the storyboard is no longer in the app. Write it again.");

  const storage = getStorage();
  const load = async (key: string) => {
    const object = await storage.get(key);
    if (!object) throw new AgentError("A captured screen is missing. Render again.");
    return object.data;
  };
  const shots = await Promise.all(input.shots.map(load));
  const music = input.music
    ? { data: await load(input.music.key), extension: input.music.extension }
    : null;
  const [project] = await ctx.db
    .select({ name: schema.project.name })
    .from(schema.project)
    .where(eq(schema.project.id, ctx.run.projectId));
  const appName = readAppDataPractices(files).appName || project?.name || "My app";

  // Loaded only when a render runs: workers without the renderer start and run everything else.
  const chrome = process.env.VIDEO_BROWSER_EXECUTABLE;
  if (chrome && !existsSync(chrome))
    throw new AgentError("Video rendering isn't set up on this server yet.");
  let video: typeof import("@appbuilder/video");
  try {
    video = await import("@appbuilder/video");
  } catch (error) {
    reportError(error, { where: "promo-render-import" });
    throw new AgentError("Video rendering isn't set up on this server yet.");
  }

  const outDir = await mkdtemp(join(tmpdir(), "promo-"));
  try {
    await ctx.emit("step", { label: "Rendering the video" });
    let shown = 0;
    const result = await video
      .renderPromo({
        props: {
          format: input.format,
          storyboard,
          colors: normalizePromoColors(input.colors),
          appName,
        },
        shots,
        music,
        outDir,
        onProgress: (fraction) => {
          const percent = Math.floor(fraction * 20) * 5;
          if (percent <= shown) return;
          shown = percent;
          void ctx.emit("step", { label: `Rendering the video… ${percent}%` });
        },
      })
      .catch((error: unknown) => {
        reportError(error, { where: "promo-render" });
        throw new AgentError("The video couldn't be rendered. Try again in a minute.");
      });
    const prefix = `projects/${ctx.run.projectId}/promo/${ctx.run.id}`;
    const videoKey = `${prefix}/video.mp4`;
    const posterKey = `${prefix}/poster.jpg`;
    await storage.put(videoKey, await readFile(result.video), "video/mp4");
    await storage.put(posterKey, await readFile(result.poster), "image/jpeg");
    return {
      output: {
        video: videoKey,
        poster: posterKey,
        format: input.format,
        seconds: result.seconds,
        width: result.width,
        height: result.height,
        bytes: (await stat(result.video)).size,
        hook: storyboard.hook,
        versionId,
      },
    };
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
}
