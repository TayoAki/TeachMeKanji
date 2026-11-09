import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
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
  for (const [path, contents] of Object.entries(files)) {
    const target = join(dir, path);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, contents);
  }
}
