import { mkdir, readdir, readFile, rm, rmdir, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve, sep } from "node:path";
import { isSafePath } from "@appbuilder/contract";
import { fileURLToPath } from "node:url";
import type { ProjectFiles } from "@appbuilder/contract";
import { loadProject } from "@appbuilder/contract/node";

export const REPO_ROOT = fileURLToPath(new URL("../../../", import.meta.url));

export function fixtureProject(name = "habit-tracker"): Promise<ProjectFiles> {
  return loadProject(join(REPO_ROOT, "templates/expo-app"), join(REPO_ROOT, "fixtures", name));
}

/** The source folders the platform owns in a project directory (node_modules and config stay). */
const SOURCE_DIRS = ["app", "components", "theme", "data"];

/** Write a project's files to disk (replacing previous source, keeping node_modules). */
export async function materialize(files: ProjectFiles, dir: string): Promise<void> {
  for (const sub of SOURCE_DIRS) {
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

async function listFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true }).catch(() => []);
  return entries.filter((e) => e.isFile()).map((e) => join(e.parentPath, e.name));
}

/**
 * Bring a directory that a running dev server watches up to date with a project's files: only
 * changed files are written and only removed ones are deleted. Deleting and rewriting the source
 * folders (as materialize does) lets Metro see files vanish mid-sync and keep reporting "Unable to
 * resolve module" for files that exist.
 */
export async function syncFiles(files: ProjectFiles, dir: string): Promise<void> {
  const root = resolve(dir);
  for (const [path, contents] of Object.entries(files)) {
    const target = resolve(root, path);
    if (!isSafePath(path) || !target.startsWith(root + sep)) {
      throw new Error(`Refusing to write unsafe path ${path}`);
    }
    const current = await readFile(target, "utf8").catch(() => null);
    if (current === contents) continue;
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
  for (const sub of SOURCE_DIRS) {
    for (const file of await listFiles(join(root, sub))) {
      if (relative(root, file).split(sep).join("/") in files) continue;
      await rm(file, { force: true });
      // Drop folders the removal left empty, up to the source folder.
      for (let d = dirname(file); d !== join(root, sub); d = dirname(d)) {
        if (
          !(await rmdir(d)
            .then(() => true)
            .catch(() => false))
        )
          break;
      }
    }
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
