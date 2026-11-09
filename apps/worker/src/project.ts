import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { isSafePath } from "@appbuilder/contract";
import { fileURLToPath } from "node:url";
import type { ProjectFiles } from "@appbuilder/contract";
import { loadProject } from "@appbuilder/contract/node";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export function fixtureProject(name = "habit-tracker"): Promise<ProjectFiles> {
  return loadProject(join(REPO_ROOT, "templates/expo-app"), join(REPO_ROOT, "fixtures", name));
}

/** Write a project's files to disk (replacing previous source, keeping node_modules). */
export async function materialize(files: ProjectFiles, dir: string): Promise<void> {
  for (const sub of ["app", "components", "theme", "data"]) {
    await rm(join(dir, sub), { recursive: true, force: true });
  }
  const root = resolve(dir);
  for (const [path, contents] of Object.entries(files)) {
    const target = resolve(root, path);
    // Defense in depth: paths are validated before they're saved, but never write outside dir.
    if (!isSafePath(path) || !target.startsWith(root + sep)) {
      throw new Error(`Refusing to write unsafe path ${path}`);
    }
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
}

/**
 * Environment for child processes (npm, Expo CLI, EAS CLI): what they need to run and reach
 * the network, never the worker's secrets (database URL, encryption key, API keys).
 */
export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const keep = [
    "PATH",
    "HOME",
    "USER",
    "LANG",
    "TMPDIR",
    "SHELL",
    "TERM",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "NO_PROXY",
    "http_proxy",
    "https_proxy",
    "no_proxy",
    "NODE_EXTRA_CA_CERTS",
    "SSL_CERT_FILE",
    "npm_config_cache",
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const key of keep) if (process.env[key] !== undefined) env[key] = process.env[key];
  return { ...env, ...extra };
}
