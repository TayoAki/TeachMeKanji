/**
 * Write the app's App Store and Google Play listing from its plan and screens: name, subtitle,
 * promotional text, description, keywords, Play short description, category, and a caption for
 * each screenshot. Then the assets: the app's icon, drawn from the plan, and the screenshots,
 * rendered from the real app and framed with those captions (1320 x 2868), kept in storage for
 * the build (the icon) and App Store Connect (both).
 */
import {
  buildRouteTree,
  normalizeListing,
  screens as listScreens,
  STORE_LIMITS,
  STORE_LISTING_JSON_SCHEMA,
  STRUCTURE_SCREENS,
  type AppPlan,
  type StoreListing,
} from "@appbuilder/contract";
import { eq } from "drizzle-orm";
import {
  getCurrentFiles,
  getStorage,
  latestPlan,
  reportError,
  storeAssetKey,
  type StoreShot,
} from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { AgentError } from "../agents/agents";
import { addUsage, textOf } from "../generation/client";
import { canRenderScreens } from "../render/screens";
import { drawIcon, frameShots, primaryOf } from "../store/assets";
import type { HandlerContext, HandlerResult } from "./context";

export const STORE_LISTING_SYSTEM = `You write App Store and Google Play listings for mobile apps: specific, benefit-first copy for the app's audience, in plain language, following both stores' rules (no prices, no "best"/"#1" claims, no other apps' names, no keyword stuffing in the name). Limits: name ${STORE_LIMITS.name} characters, subtitle ${STORE_LIMITS.subtitle}, promotional text ${STORE_LIMITS.promotionalText}, description ${STORE_LIMITS.description} (short paragraphs and a few lines starting with "• "; mention the subscription and that it renews automatically if the app sells one), keywords ${STORE_LIMITS.keywords} characters comma-separated without spaces or words already in the name, Google Play short description ${STORE_LIMITS.shortDescription}. Count characters: text over a limit is cut off. Screenshot captions: at most ${STORE_LIMITS.caption} characters each, one benefit per screenshot, for ${STORE_LIMITS.screenshots - 2} to ${STORE_LIMITS.screenshots} of the given screens in the order that tells the app's story (the main screens first).`;

export async function handleStoreListing(ctx: HandlerContext): Promise<HandlerResult> {
  const { versionId, files } = await getCurrentFiles(ctx.db, ctx.run.projectId);
  if (!versionId) throw new AgentError("Build the app first.");
  const plan = (await latestPlan(ctx.db, ctx.run.projectId))?.data as AppPlan | undefined;
  const screens = listScreens(buildRouteTree(Object.keys(files)))
    .map((s) => s.screen.file)
    // Stores want features, not settings or the paywall (which shows test mode in the preview).
    .filter((file) => file !== STRUCTURE_SCREENS.settings && file !== STRUCTURE_SCREENS.paywall);
  await ctx.emit("step", { label: "Writing the store listing" });
  const response = await ctx.createMessage({
    model: ctx.editModel,
    max_tokens: 8_000,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: STORE_LISTING_JSON_SCHEMA },
    },
    system: STORE_LISTING_SYSTEM,
    messages: [
      {
        role: "user",
        content: `The app${plan ? `:\n${JSON.stringify({ appName: plan.appName, summary: plan.summary, audience: plan.audience, angle: plan.angle, coreLoop: plan.coreLoop, shareMoment: plan.shareMoment, dailyHabit: plan.habit?.daily || undefined, premium: plan.monetization.premiumFeatures, screens: plan.screens.map((s) => ({ path: s.path, title: s.title, purpose: s.purpose })) }, null, 2)}` : " has no stored plan."}\n\nScreens you can caption (use these paths exactly): ${screens.join(", ")}\n\nThe main home screen's code:\n${(files["app/(tabs)/index.tsx"] ?? "").slice(0, 6000)}`,
      },
    ],
  });
  if (response.stop_reason !== "end_turn")
    throw new AgentError("The listing couldn't be written. Try again.");
  let raw: StoreListing;
  try {
    raw = JSON.parse(textOf(response)) as StoreListing;
  } catch {
    throw new AgentError("The listing came back malformed. Try again.");
  }
  const listing = normalizeListing(raw, screens);
  const assets = await makeAssets(ctx, { files, plan: plan ?? null, listing });
  return {
    output: { listing, versionId, ...assets },
    usage: addUsage({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, response),
  };
}

/** Draw the icon and frame the screenshots; what can't be made is said, never a failed run. */
async function makeAssets(
  ctx: HandlerContext,
  input: { files: Record<string, string>; plan: AppPlan | null; listing: StoreListing },
): Promise<{ icon: string | null; shots: StoreShot[]; assetsNote: string }> {
  const storage = getStorage();
  const [project] = await ctx.db
    .select({ activeThemeId: schema.project.activeThemeId })
    .from(schema.project)
    .where(eq(schema.project.id, ctx.run.projectId));
  const themeId = project?.activeThemeId ?? null;
  const primary = primaryOf(input.plan, themeId);
  const notes: string[] = [];
  let icon: string | null = null;
  if (input.plan) {
    await ctx.emit("step", { label: "Drawing the app icon" });
    try {
      const png = await drawIcon(input.plan, primary, (usd) => ctx.charge(usd));
      if (png) {
        await storage.put(
          storeAssetKey(ctx.run.projectId, ctx.run.id, "icon.png"),
          png,
          "image/png",
        );
        icon = "icon.png";
      } else notes.push("No image model is set up on this server, so there's no icon yet.");
    } catch (error) {
      reportError(error, { where: "store-icon", projectId: ctx.run.projectId });
      notes.push("The icon couldn't be drawn this time; write the listing again to retry.");
    }
  }
  const shots: StoreShot[] = [];
  if (await canRenderScreens()) {
    await ctx.emit("step", { label: "Making the App Store screenshots" });
    try {
      const framed = await frameShots(input.files, input.listing.screenshots, {
        themeId: themeId ?? undefined,
        primary,
      });
      for (const [i, shot] of framed.entries()) {
        const file = `shot-${String(i + 1).padStart(2, "0")}.png`;
        await storage.put(
          storeAssetKey(ctx.run.projectId, ctx.run.id, file),
          shot.png,
          "image/png",
        );
        shots.push({ screen: shot.screen, caption: shot.caption, file });
      }
    } catch (error) {
      reportError(error, { where: "store-shots", projectId: ctx.run.projectId });
      notes.push("The screenshots couldn't be made this time; write the listing again to retry.");
    }
  } else
    notes.push("This server can't render screens, so the screenshots are made in the browser.");
  return { icon, shots, assetsNote: notes.join(" ") };
}
