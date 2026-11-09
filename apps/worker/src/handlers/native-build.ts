/**
 * Native builds with EAS Build, using the user's own Expo account (their EXPO_TOKEN, stored
 * encrypted). The worker writes the project, links it to an EAS project, and submits the build
 * without waiting; EAS hosts the queue and the artifact. iOS device builds additionally need
 * the user's Apple credentials configured in their Expo account.
 */
import { existsSync } from "node:fs";
import { mkdir, symlink } from "node:fs/promises";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { eq } from "drizzle-orm";
import { dataDir, exportBundle, getCurrentFiles, PLANS, userPlan } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { AgentError } from "../agents/agents";
import { ensureRuntime } from "../device";
import { materialize } from "../project";
import type { HandlerContext, HandlerResult } from "./context";
import { integrationToken } from "./github";

function eas(args: string[], cwd: string, token: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn("npx", ["--yes", "eas-cli@latest", ...args], {
      cwd,
      env: { ...process.env, EXPO_TOKEN: token, EAS_NO_VCS: "1", CI: "1" },
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

export async function handleNativeBuild(ctx: HandlerContext): Promise<HandlerResult> {
  const input = ctx.run.input as { platform: "android" | "ios"; profile: "preview" | "production" };
  if (!PLANS[await userPlan(ctx.db, ctx.run.userId)].nativeBuilds) {
    throw new AgentError("Android and iOS builds are part of the Pro plan.");
  }
  const token = await integrationToken(ctx, "expo");
  const { versionId, files } = await getCurrentFiles(ctx.db, ctx.run.projectId);
  if (!versionId) throw new AgentError("Build the app before creating a native build.");
  const [project] = await ctx.db
    .select()
    .from(schema.project)
    .where(eq(schema.project.id, ctx.run.projectId));

  const dir = dataDir("builds", ctx.run.id);
  await mkdir(dir, { recursive: true });
  await materialize(exportBundle(project!.name, files), dir);
  const nodeModules = await ensureRuntime(files["package.json"] ?? "{}");
  if (!existsSync(join(dir, "node_modules")))
    await symlink(nodeModules, join(dir, "node_modules"), "dir");

  await ctx.emit("step", { label: "Linking the app to your Expo account" });
  await eas(["init", "--non-interactive", "--force"], dir, token);
  await ctx.emit("step", {
    label: `Submitting the ${input.platform} ${input.profile} build to EAS`,
  });
  const out = await eas(
    [
      "build",
      "--platform",
      input.platform,
      "--profile",
      input.profile,
      "--non-interactive",
      "--no-wait",
      "--json",
    ],
    dir,
    token,
  );
  const json = /\[\s*\{[\s\S]*\}\s*\]/.exec(out)?.[0];
  const builds = json
    ? (JSON.parse(json) as Array<{ id: string; buildDetailsPageUrl?: string }>)
    : [];
  const build = builds[0];
  return {
    output: {
      platform: input.platform,
      profile: input.profile,
      buildId: build?.id ?? null,
      detailsUrl: build?.buildDetailsPageUrl ?? null,
    },
  };
}
