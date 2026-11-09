import "server-only";
import { join } from "node:path";
import type { ProjectFiles } from "@appbuilder/contract";
import { readTree } from "@appbuilder/contract/node";
import { repoRoot } from "@appbuilder/core";

let cached: Promise<ProjectFiles> | null = null;

/** The current Expo template (read once per server process). */
export function templateFiles(): Promise<ProjectFiles> {
  cached ??= readTree(join(repoRoot(), "templates/expo-app"));
  return cached;
}

/** The origin generated apps call for App Cloud (must be reachable from phones in production). */
export function publicAppUrl(request: Request): string {
  return (process.env.APP_PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, "");
}
