import { readdir, readFile } from "node:fs/promises";
import { join, relative, sep } from "node:path";
import type { ProjectFiles } from "./layout";

/** Read every file under `root` into a path -> source map (POSIX-style relative paths). */
export async function readTree(root: string): Promise<ProjectFiles> {
  const files: ProjectFiles = {};
  const visit = async (dir: string) => {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await visit(full);
      else files[relative(root, full).split(sep).join("/")] = await readFile(full, "utf8");
    }
  };
  await visit(root);
  return files;
}

/** A project = the fixed template overlaid with generated files. */
export async function loadProject(
  templateDir: string,
  generatedDir: string,
): Promise<ProjectFiles> {
  return { ...(await readTree(templateDir)), ...(await readTree(generatedDir)) };
}
