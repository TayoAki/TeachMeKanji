/**
 * Spike B: open a generated project on a real phone with Expo Go.
 *
 * Snack can't do this for current SDKs (see snack-runtime-check.ts), so this runs the
 * project the standard Expo way: write the files, install the pinned SDK dependencies
 * (cached between runs), and start Expo's dev server. Expo CLI prints the QR code.
 *
 *   npm run spike:device                  # same Wi-Fi as your phone (LAN)
 *   npm run spike:device -- --tunnel      # phone on another network (uses Expo's tunnel)
 *
 * In the product this becomes a per-session dev server in a worker sandbox (Phase 6).
 */
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { formatIssues, hasErrors, validateProject } from "@appbuilder/contract";
import { fixtureProject, materialize, REPO_ROOT } from "../project";

const workDir = join(REPO_ROOT, ".spike-output/device-preview");
const files = await fixtureProject();

const issues = validateProject(files);
if (hasErrors(issues)) {
  console.error(formatIssues(issues));
  process.exit(1);
}

await materialize(files, workDir);
console.log(`project written to ${workDir}`);

if (!existsSync(join(workDir, "node_modules/expo"))) {
  console.log("installing Expo SDK dependencies (first run only)…");
  await run("npm", ["install", "--no-audit", "--no-fund"]);
}

const tunnel = process.argv.includes("--tunnel");
await run("npx", ["expo", "start", ...(tunnel ? ["--tunnel"] : [])]);

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: workDir, stdio: "inherit" });
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`)),
    );
  });
}
