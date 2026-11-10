/**
 * Set up real purchases in the user's own RevenueCat (through their RevenueCat connector): the
 * app's products from data/monetization.ts, the entitlement premium unlocks, the current
 * offering with standard packages, and the apps' public SDK keys, which go into the platform
 * file data/payments.ts as a new version.
 */
import {
  PAYMENTS_FILE,
  paymentsConfigFile,
  readAppIdentifiers,
  readPaymentsConfig,
  refreshTemplate,
  withAppIdentifiers,
} from "@appbuilder/contract";
import { readTree } from "@appbuilder/contract/node";
import { join } from "node:path";
import {
  addMessage,
  commitVersion,
  connectorAccess,
  getCurrentFiles,
  repoRoot,
} from "@appbuilder/core";
import { AgentError } from "../agents/agents";
import { runConnectorTask } from "../agents/connectors";
import type { HandlerContext, HandlerResult } from "./context";

const PACKAGE_IDS = {
  week: "$rc_weekly",
  month: "$rc_monthly",
  year: "$rc_annual",
  lifetime: "$rc_lifetime",
};
const DURATIONS = { week: "P1W", month: "P1M", year: "P1Y" };

export const PAYMENTS_SETUP_SYSTEM = `You set up in-app purchases in the user's RevenueCat account for a mobile app made in an app builder, using the RevenueCat tools. Work carefully and only add things: never delete, archive or change anything you didn't create in this task. If something with the same identifier already exists, reuse it.

When you're done, end your reply with one JSON object in a \`\`\`json block:
{"iosApiKey": "appl_… or empty", "androidApiKey": "goog_… or empty", "entitlement": "the entitlement identifier", "summary": "two or three sentences on what you set up", "storeSteps": ["what the user still has to do in App Store Connect / Google Play Console, one step each"]}`;

export async function handlePaymentsSetup(ctx: HandlerContext): Promise<HandlerResult> {
  const { connectors, problems } = await connectorAccess(ctx.db, ctx.run.userId, ["revenuecat"]);
  if (!connectors.length)
    throw new AgentError(
      problems[0] ?? "Connect RevenueCat in Settings → Connectors first, then try again.",
    );
  const current = await getCurrentFiles(ctx.db, ctx.run.projectId);
  if (!current.versionId) throw new AgentError("Build the app first.");
  const template = await readTree(join(repoRoot(), "templates/expo-app"));
  const files = withAppIdentifiers(refreshTemplate(current.files, template), ctx.run.projectId);
  const ids = readAppIdentifiers(files);
  const name =
    (JSON.parse(files["app.json"] ?? "{}") as { expo?: { name?: string } }).expo?.name ?? "App";
  const monetization = /monetization[^=]*=\s*(\{[\s\S]*\});/.exec(
    files["data/monetization.ts"] ?? "",
  )?.[1];
  const offers =
    (monetization
      ? (
          JSON.parse(monetization) as {
            offers?: Array<{
              id: string;
              label: string;
              price: string;
              period: keyof typeof PACKAGE_IDS;
              trialDays: number;
            }>;
          }
        ).offers
      : []) ?? [];
  if (!offers.length)
    throw new AgentError("The app has no plans to sell yet (data/monetization.ts).");
  const entitlement = readPaymentsConfig(files).entitlement;

  await ctx.emit("step", { label: "Setting up products in your RevenueCat" });
  const prompt = `App: "${name}". iOS bundle identifier: ${ids.ios}. Android package: ${ids.android}.

Do this in RevenueCat:
1. Use the RevenueCat project you can see: a secret API key belongs to one project. If several are listed, use the one named "${name}"; create a project only if none is listed.
2. In it, use an App Store app with bundle identifier ${ids.ios} and a Play Store app with package ${ids.android} (create them if needed).
3. For each plan below, create the product in both apps (store product identifier shown; auto-renewing subscription with the duration shown, or a non-consumable for lifetime), with the display name.
${offers
  .map(
    (o) =>
      `   - ${o.label}: identifier ${ids.ios}.${o.id}, ${o.period === "lifetime" ? "non-consumable (lifetime)" : `subscription, duration ${DURATIONS[o.period]}`}, intended price ${o.price}${o.trialDays ? `, ${o.trialDays}-day free trial` : ""}.`,
  )
  .join("\n")}
4. Create the entitlement "${entitlement}" (display name "Premium") and attach all of these products.
5. Make an offering "default" the current offering, with one package per plan using RevenueCat's standard identifiers (${offers.map((o) => `${PACKAGE_IDS[o.period]} for ${o.label}`).join(", ")}), each attached to that plan's products.
6. Read the public SDK API keys of the App Store app and the Play Store app.

Then reply with the JSON object.`;

  const result = await runConnectorTask({
    createMessage: ctx.createMessage,
    model: ctx.model,
    connectors,
    system: PAYMENTS_SETUP_SYSTEM,
    prompt,
    effort: "high",
    maxContinuations: 8,
  });
  const json =
    /```json\s*(\{[\s\S]*?\})\s*```/.exec(result.text)?.[1] ??
    /(\{[\s\S]*"iosApiKey"[\s\S]*\})/.exec(result.text)?.[1];
  let parsed: {
    iosApiKey?: string;
    androidApiKey?: string;
    entitlement?: string;
    summary?: string;
    storeSteps?: string[];
  };
  try {
    parsed = JSON.parse(json ?? "");
  } catch {
    throw new AgentError(
      `RevenueCat setup didn't finish: ${result.text.slice(0, 400) || "no reply"}`,
    );
  }
  const iosApiKey = /^appl_[A-Za-z0-9]{10,}$/.test(parsed.iosApiKey ?? "") ? parsed.iosApiKey! : "";
  const androidApiKey = /^goog_[A-Za-z0-9]{10,}$/.test(parsed.androidApiKey ?? "")
    ? parsed.androidApiKey!
    : "";
  const finalEntitlement = /^[\w.-]{1,64}$/.test(parsed.entitlement ?? "")
    ? parsed.entitlement!
    : entitlement;

  let versionId: string | null = null;
  if (iosApiKey || androidApiKey) {
    const version = await commitVersion(ctx.db, {
      projectId: ctx.run.projectId,
      files: {
        ...files,
        [PAYMENTS_FILE]: paymentsConfigFile({
          iosApiKey,
          androidApiKey,
          entitlement: finalEntitlement,
        }),
      },
      kind: "inline_edit",
      summary: "Connected RevenueCat: real purchases in store builds",
      runId: ctx.run.id,
      createdBy: ctx.run.userId,
      expectedParentId: current.versionId,
    });
    versionId = version.id;
  }
  const steps = (parsed.storeSteps ?? []).slice(0, 6).map((s) => `- ${String(s).slice(0, 240)}`);
  await addMessage(ctx.db, {
    projectId: ctx.run.projectId,
    role: "assistant",
    runId: ctx.run.id,
    content: {
      text: [
        String(parsed.summary ?? "RevenueCat is set up.").slice(0, 600),
        versionId
          ? "Store and TestFlight builds now sell through Apple and Google; Expo Go and the preview stay in test mode."
          : "I couldn't read the apps' public SDK keys, so purchases stay in test mode: paste them in the Payments panel.",
        steps.length ? `Still to do in the stores:\n${steps.join("\n")}` : "",
      ]
        .filter(Boolean)
        .join("\n\n"),
      versionId,
    },
  });
  return {
    output: { versionId, iosApiKey: Boolean(iosApiKey), androidApiKey: Boolean(androidApiKey) },
    usage: result.usage,
  };
}
