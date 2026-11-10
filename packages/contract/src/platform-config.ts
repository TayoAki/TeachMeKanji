import { APP_INFO_FILE, MONETIZATION_FILE, withAppStructure } from "./app-structure";
import { TEMPLATE_FILES, type ProjectFiles } from "./layout";

export const BACKEND_CONFIG_FILE = "data/backend.ts";
export const IMAGES_FILE = "data/images.ts";
export const PAYMENTS_FILE = "data/payments.ts";
export const ANALYTICS_CONFIG_FILE = "data/analytics-config.ts";

export interface AnalyticsConfig {
  /** The platform's origin when analytics is on, else "" (track() does nothing). */
  url: string;
  projectId: string;
}

/** data/analytics-config.ts is written by the platform (the Analytics tab), never by the model. */
export function analyticsConfigFile(config: AnalyticsConfig): string {
  return `// PLATFORM FILE — written by the platform when you turn analytics on or off in the builder.
/** Where usage events go; an empty url means analytics is off and track() does nothing. */
export const analyticsConfig = ${JSON.stringify(config, null, 2)};
`;
}

export function readAnalyticsConfig(files: ProjectFiles): AnalyticsConfig {
  const json = /=\s*(\{[\s\S]*\});\s*$/.exec(files[ANALYTICS_CONFIG_FILE] ?? "")?.[1];
  try {
    const parsed = json ? (JSON.parse(json) as Partial<AnalyticsConfig>) : {};
    return { url: String(parsed.url ?? ""), projectId: String(parsed.projectId ?? "") };
  } catch {
    return { url: "", projectId: "" };
  }
}

export interface PaymentsConfig {
  /** RevenueCat public SDK keys (meant to ship inside the app); "" keeps purchases simulated. */
  iosApiKey: string;
  androidApiKey: string;
  /** The RevenueCat entitlement that unlocks premium. */
  entitlement: string;
}

export const DEFAULT_PAYMENTS: PaymentsConfig = {
  iosApiKey: "",
  androidApiKey: "",
  entitlement: "premium",
};

/** data/payments.ts is written by the platform (the Payments panel), never by the model. */
export function paymentsConfigFile(config: PaymentsConfig): string {
  return `// PLATFORM FILE — written by the platform when you connect RevenueCat in the builder.
/** Real purchases in store and TestFlight builds; without keys, purchases are simulated. */
export const payments = ${JSON.stringify(config, null, 2)};
`;
}

export function readPaymentsConfig(files: ProjectFiles): PaymentsConfig {
  const json = /=\s*(\{[\s\S]*\});\s*$/.exec(files[PAYMENTS_FILE] ?? "")?.[1];
  try {
    const parsed = json ? (JSON.parse(json) as Partial<PaymentsConfig>) : {};
    return {
      iosApiKey: String(parsed.iosApiKey ?? ""),
      androidApiKey: String(parsed.androidApiKey ?? ""),
      entitlement: String(parsed.entitlement || "premium"),
    };
  } catch {
    return DEFAULT_PAYMENTS;
  }
}

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
  const keep = new Set([
    "app.json",
    BACKEND_CONFIG_FILE,
    IMAGES_FILE,
    PAYMENTS_FILE,
    ANALYTICS_CONFIG_FILE,
  ]);
  const next: ProjectFiles = { ...files };
  for (const path of TEMPLATE_FILES) {
    const fromTemplate = template[path];
    if (fromTemplate === undefined) continue;
    if (keep.has(path) && next[path] !== undefined) continue;
    if (path === "package.json" && next[path] !== undefined) {
      next[path] = withTemplateDependencies(next[path]!, fromTemplate);
      continue;
    }
    next[path] = fromTemplate;
  }
  // app.json is the app's own (name, identifiers), but it needs the template's plugins: they
  // carry the permission strings the platform's helpers rely on (camera, location...).
  if (next["app.json"] !== undefined && template["app.json"] !== undefined)
    next["app.json"] = withTemplatePlugins(next["app.json"], template["app.json"]);
  // Editable platform files apps made before them never had: seed the defaults.
  for (const path of [MONETIZATION_FILE, APP_INFO_FILE]) {
    if (next[path] === undefined && template[path] !== undefined) next[path] = template[path];
  }
  return withAppStructure(next);
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

/** The project's package.json with the template's dependencies (the template's versions win). */
function withTemplateDependencies(projectJson: string, templateJson: string): string {
  try {
    const project = JSON.parse(projectJson) as { dependencies?: Record<string, string> };
    const template = JSON.parse(templateJson) as { dependencies?: Record<string, string> };
    const dependencies = { ...project.dependencies, ...template.dependencies };
    const sorted = Object.fromEntries(
      Object.entries(dependencies).sort(([a], [b]) => a.localeCompare(b)),
    );
    const next = JSON.stringify({ ...project, dependencies: sorted }, null, 2) + "\n";
    return next === projectJson ? projectJson : next;
  } catch {
    return templateJson;
  }
}

function withTemplatePlugins(projectJson: string, templateJson: string): string {
  try {
    const project = JSON.parse(projectJson) as { expo: Record<string, unknown> };
    const template = JSON.parse(templateJson) as { expo: { plugins?: unknown } };
    const next =
      JSON.stringify(
        { ...project, expo: { ...project.expo, plugins: template.expo.plugins } },
        null,
        2,
      ) + "\n";
    return JSON.stringify(project.expo.plugins) === JSON.stringify(template.expo.plugins)
      ? projectJson
      : next;
  } catch {
    return projectJson;
  }
}

/**
 * The app's store identifiers in app.json (iOS bundle identifier, Android package), needed by
 * store builds and RevenueCat. Kept once set (users may change them in the Publish dialog).
 */
export function withAppIdentifiers(files: ProjectFiles, projectId: string): ProjectFiles {
  const appJson = files["app.json"];
  if (!appJson) return files;
  const parsed = JSON.parse(appJson) as {
    expo: { slug?: string; ios?: Record<string, unknown>; android?: Record<string, unknown> };
  };
  if (parsed.expo.ios?.bundleIdentifier && parsed.expo.android?.package) return files;
  const id = appIdentifier(String(parsed.expo.slug ?? "app"), projectId);
  parsed.expo.ios = {
    ...parsed.expo.ios,
    bundleIdentifier: parsed.expo.ios?.bundleIdentifier ?? id,
  };
  parsed.expo.android = { ...parsed.expo.android, package: parsed.expo.android?.package ?? id };
  return { ...files, "app.json": JSON.stringify(parsed, null, 2) + "\n" };
}

/** com.appbuilder.<slug><4 characters of the project id>: valid for both stores. */
export function appIdentifier(slug: string, projectId: string): string {
  const name =
    slug
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .replace(/^[0-9]+/, "") || "app";
  const suffix = projectId
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .slice(-4);
  return `com.appbuilder.${name.slice(0, 30)}${suffix}`;
}

export function readAppIdentifiers(files: ProjectFiles): { ios: string; android: string } {
  try {
    const parsed = JSON.parse(files["app.json"] ?? "{}") as {
      expo?: { ios?: { bundleIdentifier?: string }; android?: { package?: string } };
    };
    return {
      ios: parsed.expo?.ios?.bundleIdentifier ?? "",
      android: parsed.expo?.android?.package ?? "",
    };
  } catch {
    return { ios: "", android: "" };
  }
}

export interface StoreSettings {
  /** iOS bundle identifier (also the App Store Connect app's bundle ID). */
  ios: string;
  /** Android package name (also the Google Play app's package). */
  android: string;
  /** The App Store Connect app's Apple ID (digits): TestFlight uploads go to this app. */
  ascAppId: string;
}

export const IDENTIFIER_PATTERN = /^[a-zA-Z][a-zA-Z0-9]*(\.[a-zA-Z][a-zA-Z0-9_]*){2,}$/;

export function readStoreSettings(files: ProjectFiles): StoreSettings {
  const ids = readAppIdentifiers(files);
  let ascAppId = "";
  try {
    const parsed = JSON.parse(files["app.json"] ?? "{}") as {
      expo?: { extra?: { ascAppId?: string } };
    };
    ascAppId = String(parsed.expo?.extra?.ascAppId ?? "");
  } catch {
    // keep empty
  }
  return { ...ids, ascAppId };
}

/** Write the store settings into app.json (the identifiers, and the App Store Connect app id). */
export function withStoreSettings(files: ProjectFiles, settings: StoreSettings): ProjectFiles {
  const parsed = JSON.parse(files["app.json"] ?? '{"expo":{}}') as {
    expo: {
      ios?: Record<string, unknown>;
      android?: Record<string, unknown>;
      extra?: Record<string, unknown>;
    };
  };
  parsed.expo.ios = { ...parsed.expo.ios, bundleIdentifier: settings.ios };
  parsed.expo.android = { ...parsed.expo.android, package: settings.android };
  parsed.expo.extra = { ...parsed.expo.extra, ascAppId: settings.ascAppId || undefined };
  return { ...files, "app.json": JSON.stringify(parsed, null, 2) + "\n" };
}
