import { isTemplateFile, REQUIRED_GENERATED_FILES, type ProjectFiles } from "./layout";
import {
  APP_INFO_FILE,
  countLimitedScreens,
  MONETIZATION_FILE,
  withAppStructure,
} from "./app-structure";
import { BACKEND_CONFIG_FILE, refreshTemplate } from "./platform-config";
import { hasErrors, isSafePath, validateProject, type Issue } from "./validate";

/** Limits for one batch of changes (an MCP write or similar). */
export const CHANGE_LIMITS = { files: 60, fileBytes: 200 * 1024 };

/** Files outside the template that the author (a model or a person) may write or delete. */
export function isWritablePath(path: string): boolean {
  if (!isSafePath(path) || isTemplateFile(path)) return false;
  if (path.startsWith("app/") || path.startsWith("components/")) return /\.tsx?$/.test(path);
  // Reference content grows in its own files (data/content/<name>.ts), merged by data/seed.ts.
  if (/^data\/content\/[a-z0-9][a-z0-9_-]*\.ts$/.test(path)) return true;
  return [
    "theme/tokens.ts",
    "data/schema.ts",
    "data/seed.ts",
    MONETIZATION_FILE,
    APP_INFO_FILE,
  ].includes(path);
}

export interface ChangeResult {
  files: ProjectFiles;
  /** Paths written or deleted. */
  changed: string[];
  /** Paths refused before validation, and why. */
  rejected: Array<{ path: string; reason: string }>;
  /** Validator findings for the resulting project. */
  issues: Issue[];
  /** True when the result may be saved as a new version. */
  ok: boolean;
}

/**
 * Apply writes and deletes to a project's files: platform files come from the current template
 * (and can't be written), every path is checked, and the whole project is validated.
 */
export function applyChanges(
  base: ProjectFiles,
  template: ProjectFiles,
  changes: { write?: Record<string, string>; remove?: string[] },
  options: { maxScreens: number },
): ChangeResult {
  let files = refreshTemplate(base, template);
  if (files[BACKEND_CONFIG_FILE] === undefined && template[BACKEND_CONFIG_FILE] !== undefined) {
    files[BACKEND_CONFIG_FILE] = template[BACKEND_CONFIG_FILE];
  }
  const rejected: ChangeResult["rejected"] = [];
  const changed: string[] = [];
  const writes = Object.entries(changes.write ?? {});
  const removes = changes.remove ?? [];
  if (writes.length + removes.length > CHANGE_LIMITS.files) {
    rejected.push({
      path: "*",
      reason: `At most ${CHANGE_LIMITS.files} files per change; split it into smaller batches.`,
    });
  }
  for (const [path, source] of writes) {
    if (!isWritablePath(path)) {
      rejected.push({ path, reason: writableReason(path) });
    } else if (typeof source !== "string" || Buffer.byteLength(source) > CHANGE_LIMITS.fileBytes) {
      rejected.push({ path, reason: "Each file must be text under 200 KB." });
    } else if (files[path] !== source) {
      files[path] = source;
      changed.push(path);
    }
  }
  for (const path of removes) {
    if (!isWritablePath(path)) rejected.push({ path, reason: writableReason(path) });
    else if ((REQUIRED_GENERATED_FILES as readonly string[]).includes(path)) {
      rejected.push({ path, reason: "Every app needs this file; rewrite it instead." });
    } else if (files[path] !== undefined) {
      delete files[path];
      changed.push(path);
    }
  }
  files = withAppStructure(files);
  // Onboarding, paywall and settings come with every app and don't count toward the limit.
  const before = countLimitedScreens(base);
  const after = countLimitedScreens(files);
  if (after > options.maxScreens && after > before) {
    rejected.push({
      path: "*",
      reason: `This plan allows ${options.maxScreens} screens per app (this change makes ${after}).`,
    });
  }
  const issues = validateProject(files);
  return { files, changed, rejected, issues, ok: rejected.length === 0 && !hasErrors(issues) };
}

function writableReason(path: string): string {
  if (!isSafePath(path)) return "Not a valid relative file path.";
  if (isTemplateFile(path)) return "This file belongs to the platform and can't be changed.";
  return "Only app/ and components/ (.ts/.tsx), theme/tokens.ts, data/schema.ts, data/seed.ts, data/content/*.ts, data/monetization.ts and data/app-info.ts can be written.";
}

/** Set the app's display name, slug and URL scheme in app.json. */
export function applyAppName(files: ProjectFiles, appName: string): ProjectFiles {
  const appJson = files["app.json"];
  if (!appJson) return files;
  const parsed = JSON.parse(appJson) as { expo: Record<string, unknown> };
  const slug =
    appName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "app";
  parsed.expo.name = appName;
  parsed.expo.slug = slug;
  parsed.expo.scheme = slug.replace(/-/g, "");
  return { ...files, "app.json": JSON.stringify(parsed, null, 2) + "\n" };
}
