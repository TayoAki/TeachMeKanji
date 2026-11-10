/**
 * Native builds with EAS Build, using the user's own Expo account (their EXPO_TOKEN, stored
 * encrypted). The worker writes the project, links it to an EAS project, and submits the build
 * without waiting; EAS hosts the queue and the artifact.
 *
 * With `submit`, the build goes to the stores by itself (EAS auto-submit): TestFlight with the
 * user's App Store Connect API key (which also lets EAS create the signing certificate and
 * profile), or Google Play's internal testing track (as a draft release) with their Play
 * service account key. The keys are written into the build folder only for the run.
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, rm, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { and, eq } from "drizzle-orm";
import { readStoreSettings, withAppIdentifiers } from "@appbuilder/contract";
import {
  dataDir,
  decryptSecret,
  exportBundle,
  getCurrentFiles,
  parseAppStoreConnectKey,
  parsePlayServiceAccount,
  PLANS,
  userPlan,
} from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { AgentError } from "../agents/agents";
import { ensureRuntime } from "../device";
import { childEnv, materialize } from "../project";
import type { HandlerContext, HandlerResult } from "./context";
import { integrationToken } from "./github";

/** Pinned so a compromised or breaking "latest" release can't run with the user's token. */
const EAS_CLI = "eas-cli@27.5.0";

function eas(
  args: string[],
  cwd: string,
  token: string,
  env: Record<string, string> = {},
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", EAS_CLI, ...args], {
      cwd,
      env: childEnv({ EXPO_TOKEN: token, EAS_NO_VCS: "1", CI: "1", ...env }),
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("exit", (code) =>
      code === 0
        ? resolve(out)
        : reject(new AgentError(`eas ${args[0]} failed:\n${out.slice(-1500)}`)),
    );
  });
}

async function storeKey(ctx: HandlerContext, provider: "app-store-connect" | "play-console") {
  const [row] = await ctx.db
    .select()
    .from(schema.integration)
    .where(
      and(eq(schema.integration.userId, ctx.run.userId), eq(schema.integration.provider, provider)),
    );
  if (!row)
    throw new AgentError(
      provider === "app-store-connect"
        ? "Add your App Store Connect API key in Settings → Phone builds to send builds to TestFlight."
        : "Add your Google Play service account key in Settings → Phone builds to send builds to Google Play.",
    );
  return decryptSecret(row.encryptedToken);
}

export async function handleNativeBuild(ctx: HandlerContext): Promise<HandlerResult> {
  const input = ctx.run.input as {
    platform: "android" | "ios";
    profile: "preview" | "production";
    submit?: boolean;
  };
  const profile = input.submit ? "production" : input.profile;
  if (!PLANS[await userPlan(ctx.db, ctx.run.userId)].nativeBuilds) {
    throw new AgentError("Android and iOS builds are part of the paid plans.");
  }
  const token = await integrationToken(ctx, "expo");
  const current = await getCurrentFiles(ctx.db, ctx.run.projectId);
  if (!current.versionId) throw new AgentError("Build the app before creating a native build.");
  const files = withAppIdentifiers(current.files, ctx.run.projectId);
  const [project] = await ctx.db
    .select()
    .from(schema.project)
    .where(eq(schema.project.id, ctx.run.projectId));

  // Store submission: the keys, and where the build goes.
  const env: Record<string, string> = {};
  let submit: Record<string, unknown> = {};
  const secrets: Array<{ name: string; content: string }> = [];
  if (input.submit && input.platform === "ios") {
    const key = parseAppStoreConnectKey(await storeKey(ctx, "app-store-connect"));
    const { ascAppId } = readStoreSettings(files);
    if (!ascAppId)
      throw new AgentError(
        "Add the App Store Connect app ID in the build dialog first (create the app in App Store Connect with the bundle ID shown there).",
      );
    secrets.push({ name: "asc-api-key.p8", content: key.privateKey });
    Object.assign(env, {
      EXPO_ASC_API_KEY_PATH: "./asc-api-key.p8",
      EXPO_ASC_KEY_ID: key.keyId,
      EXPO_ASC_ISSUER_ID: key.issuerId,
      EXPO_APPLE_TEAM_ID: key.teamId,
      EXPO_APPLE_TEAM_TYPE: key.teamType,
    });
    submit = {
      ios: {
        ascAppId,
        ascApiKeyPath: "./asc-api-key.p8",
        ascApiKeyIssuerId: key.issuerId,
        ascApiKeyId: key.keyId,
      },
    };
  }
  if (input.submit && input.platform === "android") {
    const key = parsePlayServiceAccount(await storeKey(ctx, "play-console"));
    secrets.push({ name: "play-service-account.json", content: JSON.stringify(key) });
    submit = {
      android: {
        serviceAccountKeyPath: "./play-service-account.json",
        track: "internal",
        // Google only accepts draft releases until the app's first release is reviewed.
        releaseStatus: "draft",
      },
    };
  }

  const dir = dataDir("builds", ctx.run.id);
  await mkdir(dir, { recursive: true });
  try {
    const bundle = exportBundle(project!.name, files);
    const easJson = JSON.parse(bundle["eas.json"]!) as { submit: Record<string, unknown> };
    easJson.submit = { production: submit };
    await materialize({ ...bundle, "eas.json": JSON.stringify(easJson, null, 2) + "\n" }, dir);
    for (const secret of secrets) {
      await writeFile(join(dir, secret.name), secret.content);
      await chmod(join(dir, secret.name), 0o600);
    }
    const nodeModules = await ensureRuntime(files["package.json"] ?? "{}");
    if (!existsSync(join(dir, "node_modules")))
      await symlink(nodeModules, join(dir, "node_modules"), "dir");

    await ctx.emit("step", { label: "Linking the app to your Expo account" });
    await eas(["init", "--non-interactive", "--force"], dir, token, env);
    await ctx.emit("step", {
      label: input.submit
        ? `Building for ${input.platform === "ios" ? "TestFlight" : "Google Play internal testing"}`
        : `Submitting the ${input.platform} ${profile} build to EAS`,
    });
    const out = await eas(
      [
        "build",
        "--platform",
        input.platform,
        "--profile",
        profile,
        "--non-interactive",
        "--no-wait",
        "--json",
        ...(input.submit ? ["--auto-submit"] : []),
      ],
      dir,
      token,
      env,
    );
    const json = /\[\s*\{[\s\S]*\}\s*\]/.exec(out)?.[0];
    const builds = json
      ? (JSON.parse(json) as Array<{ id: string; buildDetailsPageUrl?: string }>)
      : [];
    const build = builds[0];
    return {
      output: {
        platform: input.platform,
        profile,
        submit: Boolean(input.submit),
        buildId: build?.id ?? null,
        detailsUrl: build?.buildDetailsPageUrl ?? null,
      },
    };
  } finally {
    // The keys never stay on the worker; EAS has what it needs once the build is queued.
    await rm(dir, { recursive: true, force: true });
  }
}
