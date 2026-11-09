import { TEMPLATE_FILES, type ProjectFiles } from "./layout";

export const BACKEND_CONFIG_FILE = "data/backend.ts";
export const IMAGES_FILE = "data/images.ts";

export interface PlatformConfig {
  /** App Cloud base URL (the platform's origin) when the backend is enabled, else "". */
  apiUrl: string;
  projectId: string;
  /** ImageKit URL endpoint for AI images, else "" (placeholders). */
  imageEndpoint: string;
}

/** data/backend.ts is written by the platform, never by the model. */
export function backendConfigFile(config: PlatformConfig): string {
  return `// PLATFORM FILE — written by the platform when you enable App Cloud or AI images.
export const backend = {
  /** App Cloud API origin; empty means data stays on the device. */
  apiUrl: ${JSON.stringify(config.apiUrl)},
  projectId: ${JSON.stringify(config.projectId)},
};

export const images = {
  /** ImageKit URL endpoint for AI-generated images; empty shows placeholders. */
  endpoint: ${JSON.stringify(config.imageEndpoint)},
};
`;
}

export function readPlatformConfig(files: ProjectFiles): PlatformConfig {
  const source = files[BACKEND_CONFIG_FILE] ?? "";
  const field = (name: string) =>
    /"([^"]*)"/.exec(new RegExp(`${name}: ("[^"]*")`).exec(source)?.[1] ?? '""')?.[1] ?? "";
  return {
    apiUrl: field("apiUrl"),
    projectId: field("projectId"),
    imageEndpoint: field("endpoint"),
  };
}

/**
 * Bring a project's platform-owned files up to the current template. Neither the model nor
 * the inspector writes template files, so they can be replaced safely; app.json and
 * package.json (app name, pinned versions) and the platform config are kept if present.
 */
export function refreshTemplate(files: ProjectFiles, template: ProjectFiles): ProjectFiles {
  const keep = new Set(["app.json", "package.json", BACKEND_CONFIG_FILE, IMAGES_FILE]);
  const next: ProjectFiles = { ...files };
  for (const path of TEMPLATE_FILES) {
    const fromTemplate = template[path];
    if (fromTemplate === undefined) continue;
    if (keep.has(path) && next[path] !== undefined) continue;
    next[path] = fromTemplate;
  }
  return next;
}

/** data/images.ts: the images added to an app, by name (written by the platform). */
export function appImagesFile(images: Record<string, string>): string {
  return `// PLATFORM FILE — written by the platform when images are added to the app.
/** Images added to this app, by name: use them with <AiImage name="..." />. */
export const appImages: Record<string, string> = ${JSON.stringify(images, null, 2)};
`;
}

export function readAppImages(files: ProjectFiles): Record<string, string> {
  const source = files[IMAGES_FILE] ?? "";
  const json = /=\s*(\{[\s\S]*\});\s*$/.exec(source)?.[1];
  if (!json) return {};
  try {
    const parsed = JSON.parse(json) as Record<string, unknown>;
    return Object.fromEntries(
      Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === "string"),
    );
  } catch {
    return {};
  }
}
