/**
 * App Store Connect from the worker: what App Builder fills in an app's record when it's sent
 * to TestFlight (appStoreFill), and the "Submit for review" step (handleStoreSubmit), both with
 * the owner's App Store Connect key and App Review contact (Settings → Phone builds).
 */
import { and, eq } from "drizzle-orm";
import sharp from "sharp";
import {
  ageRatingAnswers,
  ascCategoryId,
  hostedAppPages,
  privacyAnswers,
  readAppDataPractices,
  readAppPrivacyUrl,
  readStoreSettings,
  reviewNotes,
  type AppPlan,
  type ProjectFiles,
} from "@appbuilder/contract";
import {
  decryptSecret,
  ensureReviewAccount,
  getCurrentFiles,
  getStorage,
  latestPlan,
  latestStoreAssets,
  parseAppStoreConnectKey,
  parseReviewProfile,
  storeAssetKey,
  submitForReview,
  type AppStoreFill,
  type ReviewProfile,
  type StoreAssets,
} from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { AgentError } from "../agents/agents";
import type { HandlerContext, HandlerResult } from "../handlers/context";
import { platformUrl } from "../platform-url";

async function integrationValue(ctx: HandlerContext, provider: string): Promise<string | null> {
  const [row] = await ctx.db
    .select({ token: schema.integration.encryptedToken })
    .from(schema.integration)
    .where(
      and(eq(schema.integration.userId, ctx.run.userId), eq(schema.integration.provider, provider)),
    );
  return row ? decryptSecret(row.token) : null;
}

/** The owner's App Review contact and copyright holder, or null when not set up. */
export async function reviewProfile(ctx: HandlerContext): Promise<ReviewProfile | null> {
  const raw = await integrationValue(ctx, "app-review-profile");
  try {
    return raw ? parseReviewProfile(raw) : null;
  } catch {
    return null;
  }
}

/** Everything App Builder can fill in the app's App Store Connect record. */
export async function appStoreFill(
  ctx: HandlerContext,
  files: ProjectFiles,
  made: StoreAssets | null,
): Promise<{ fill: AppStoreFill; missing: string[] }> {
  const plan = ((await latestPlan(ctx.db, ctx.run.projectId))?.data as AppPlan | undefined) ?? null;
  const practices = readAppDataPractices(files);
  const pages = hostedAppPages(platformUrl(), ctx.run.projectId);
  const profile = await reviewProfile(ctx);
  const categoryId = made ? ascCategoryId(made.listing.category) : null;
  const demoAccount =
    practices.accounts && profile ? await ensureReviewAccount(ctx.db, ctx.run.projectId) : null;
  const appName = practices.appName || plan?.appName || "The app";
  const storage = getStorage();
  const missing: string[] = [];
  if (!made)
    missing.push("Write the store listing first to fill the listing text and screenshots.");
  if (!profile)
    missing.push(
      "Add the App Review contact in Settings → Phone builds to fill App Review information and the copyright.",
    );
  return {
    missing,
    fill: {
      privacyPolicyUrl: readAppPrivacyUrl(files) || pages.privacyUrl,
      supportUrl: pages.supportUrl,
      marketingUrl: pages.marketingUrl,
      platformOrigin: platformUrl(),
      listing: made?.listing ?? null,
      categoryId,
      ageRating: ageRatingAnswers(categoryId),
      // AI answers come from a third party's model (which the owner has the rights to use).
      contentRights: practices.ai ? "USES_THIRD_PARTY_CONTENT" : "DOES_NOT_USE_THIRD_PARTY_CONTENT",
      copyright: profile ? `${new Date().getFullYear()} ${profile.copyrightHolder}` : undefined,
      review: profile
        ? {
            contactFirstName: profile.firstName,
            contactLastName: profile.lastName,
            contactPhone: profile.phone,
            contactEmail: profile.email,
            notes: reviewNotes({
              plan,
              practices,
              appName,
              demoAccount,
              supportUrl: pages.supportUrl,
            }),
            demoAccount,
          }
        : undefined,
      free: true,
      screenshots: made?.shots.map((shot) => ({
        name: shot.file.replace(/\.png$/, ""),
        load: async ({ width, height }) => {
          const object = await storage.get(storeAssetKey(ctx.run.projectId, made.runId, shot.file));
          if (!object) throw new AgentError(`The screenshot ${shot.file} is missing.`);
          return sharp(object.data)
            .resize(width, height, { fit: "cover" })
            .removeAlpha()
            .png()
            .toBuffer();
        },
      })),
    },
  };
}

/** A pre-order date: YYYY-MM-DD, 2 to 180 days from today (Apple's limits for a first release). */
export function preOrderDateProblem(date: string, today = new Date()): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return "Pick the release date.";
  const days =
    (Date.parse(`${date}T00:00:00Z`) - Date.parse(today.toISOString().slice(0, 10))) / 86_400_000;
  if (!(days >= 2 && days <= 180))
    return "A pre-order's release date must be 2 to 180 days from today.";
  return null;
}

/**
 * Submit for review: attach the processed build, make the app available (as a pre-order when a
 * date is given) and send it to App Review. The output lists what's done, what Apple refused,
 * and what only App Store Connect's website can do, with the App Privacy answers to click in.
 */
export async function handleStoreSubmit(ctx: HandlerContext): Promise<HandlerResult> {
  const input = ctx.run.input as { preOrderDate?: string | null };
  const raw = await integrationValue(ctx, "app-store-connect");
  if (!raw)
    throw new AgentError(
      "Add your App Store Connect API key in Settings → Phone builds to submit for review.",
    );
  const key = parseAppStoreConnectKey(raw);
  const { files } = await getCurrentFiles(ctx.db, ctx.run.projectId);
  const { ascAppId } = readStoreSettings(files);
  if (!ascAppId) throw new AgentError("Add the App Store Connect app ID under Send to the stores.");
  const preOrderDate = input.preOrderDate || null;
  if (preOrderDate) {
    const problem = preOrderDateProblem(preOrderDate);
    if (problem) throw new AgentError(problem);
  }
  let versionString = "1.0.0";
  try {
    versionString =
      (JSON.parse(files["app.json"] ?? "{}") as { expo?: { version?: string } }).expo?.version ||
      versionString;
  } catch {
    // keep the default
  }
  await ctx.emit("step", { label: "Submitting to App Review" });
  const result = await submitForReview(key, ascAppId, { versionString, preOrderDate });
  const practices = readAppDataPractices(files);
  const made = await latestStoreAssets(ctx.db, ctx.run.projectId);
  const category = made ? ascCategoryId(made.listing.category) : null;
  const manual = [
    "App Privacy: in App Store Connect → App Privacy, answer with the data types below (none used for tracking) and click Publish. Apple has no API for it.",
    "If you sell in the EU, set your Digital Services Act trader status (App Store Connect → Business).",
    ...(category === "HEALTH_AND_FITNESS" || category === "MEDICAL"
      ? [
          "Health & Fitness and Medical apps answer the Regulated Medical Devices question under App Information.",
        ]
      : []),
    preOrderDate
      ? `After approval, open the version and click Release This Version: it goes up for pre-order and downloads on ${preOrderDate}.`
      : "After approval, release the version from App Store Connect when you're ready.",
  ];
  return {
    output: {
      ...result,
      preOrderDate,
      manual,
      privacy: privacyAnswers(practices),
      appStoreConnectUrl: `https://appstoreconnect.apple.com/apps/${ascAppId}/distribution`,
    },
  };
}
