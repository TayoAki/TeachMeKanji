/**
 * File layout of a generated app. Template files are fixed and owned by the platform;
 * the model writes everything else, and only under the allowed roots.
 */
export const TEMPLATE_FILES = [
  "package.json",
  "app.json",
  "tsconfig.json",
  "app/_layout.tsx",
  "theme/types.ts",
  "theme/ThemeProvider.tsx",
  "theme/active.ts",
  "data/repo.ts",
  "data/local.ts",
  "data/remote.ts",
  "data/auth.ts",
  "data/backend.ts",
  "data/images.ts",
  "data/app-state.ts",
  "data/purchases.ts",
  "data/app-structure.ts",
  "components/AiImage.tsx",
] as const;

/** Files every generated app must contain in addition to the template. */
export const REQUIRED_GENERATED_FILES = [
  "app/(tabs)/_layout.tsx",
  "app/(tabs)/index.tsx",
  "theme/tokens.ts",
  "data/schema.ts",
  "data/seed.ts",
  // Seeded by the platform (from the plan) and editable afterwards.
  "data/monetization.ts",
  "data/app-info.ts",
] as const;

export const GENERATED_ROOTS = ["app/", "components/", "theme/", "data/"] as const;

/** The only file allowed to contain literal colors. */
export const TOKENS_FILE = "theme/tokens.ts";

export function isTemplateFile(path: string): boolean {
  return (TEMPLATE_FILES as readonly string[]).includes(path);
}

export function isScreenFile(path: string): boolean {
  return path.startsWith("app/") && !path.endsWith("/_layout.tsx") && path.endsWith(".tsx");
}

export function isLayoutFile(path: string): boolean {
  return path.startsWith("app/") && path.endsWith("_layout.tsx");
}

export function isDataLayerFile(path: string): boolean {
  return path.startsWith("data/");
}

export type ProjectFiles = Record<string, string>;
