/**
 * TEMPORARY, for the design-first test only: approved mockups for a project are read from
 * DESIGN_TEST_DIR/<projectId>/manifest.json ({"screens": {path: file}, "images": {name: file}}).
 * The images (mascot poses) are stored as app images, the way the MCP add-image tool does it.
 * The real feature keeps mockups in storage and the database; this file goes away then.
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { getStorage, newId } from "@appbuilder/core";
import { schema, type Database } from "@appbuilder/db";
import type { BuildDesign, MockupImage } from "./agents/prompts";

interface Manifest {
  screens: Record<string, string>;
  images?: Record<string, string>;
}

export async function loadTestDesign(
  db: Database,
  projectId: string,
): Promise<BuildDesign | undefined> {
  const root = process.env.DESIGN_TEST_DIR || "";
  if (!root) return undefined;
  const dir = join(root, projectId);
  let manifest: Manifest;
  try {
    manifest = JSON.parse(await readFile(join(dir, "manifest.json"), "utf8")) as Manifest;
  } catch {
    return undefined;
  }
  const mockups: Record<string, MockupImage> = {};
  for (const [path, file] of Object.entries(manifest.screens)) {
    const data = await readFile(join(dir, file));
    mockups[path] = {
      mediaType: data[0] === 0x89 ? "image/png" : "image/jpeg",
      data: data.toString("base64"),
    };
  }
  const origin = (
    process.env.APP_PUBLIC_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
  const images: Record<string, string> = {};
  for (const [name, file] of Object.entries(manifest.images ?? {})) {
    const data = await readFile(join(dir, file));
    const id = newId("img");
    const storageKey = `projects/${projectId}/images/${id}`;
    await getStorage().put(storageKey, data, "image/png");
    await db.insert(schema.projectAsset).values({
      id,
      projectId,
      storageKey,
      fileName: name,
      mime: "image/png",
      bytes: data.byteLength,
      purpose: "app_image",
    });
    images[name] = `${origin}/api/app-images/${id}`;
  }
  return { mockups, images };
}
