import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

let cached: string | undefined;

/** The monorepo root (the nearest package.json with "workspaces"), found from the cwd. */
export function repoRoot(): string {
  if (cached) return cached;
  let dir = process.cwd();
  for (;;) {
    const pkg = join(dir, "package.json");
    if (existsSync(pkg) && "workspaces" in JSON.parse(readFileSync(pkg, "utf8")))
      return (cached = dir);
    const parent = dirname(dir);
    if (parent === dir) return (cached = process.cwd());
    dir = parent;
  }
}

/** Local data directory for development: storage, device-preview projects, caches. */
export function dataDir(...parts: string[]): string {
  return join(process.env.APP_DATA_DIR ?? join(repoRoot(), ".data"), ...parts);
}
