/**
 * The plan the agent proposes before building: app name, screens, data collections and
 * theme ideas. The user revises it in chat, then confirms it to start a build.
 */
export interface PlanScreen {
  /** Stable key, e.g. "today". */
  key: string;
  title: string;
  kind: "tab" | "stack";
  /** File path, e.g. "app/(tabs)/index.tsx" or "app/habit/[id].tsx". */
  path: string;
  purpose: string;
  /** Ionicons name for tab screens. */
  icon: string;
}

export interface PlanField {
  name: string;
  type: "string" | "number" | "boolean" | "date";
  description: string;
}

export interface PlanCollection {
  name: string;
  description: string;
  fields: PlanField[];
}

export interface PlanTheme {
  id: string;
  name: string;
  mood: string;
  dark: boolean;
  /** Hex color used for the plan card swatch; the full palette is generated at build time. */
  primary: string;
}

export interface AppPlan {
  appName: string;
  summary: string;
  screens: PlanScreen[];
  collections: PlanCollection[];
  themes: PlanTheme[];
}

/** JSON schema for structured outputs (every object closed, every property required). */
export const APP_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["appName", "summary", "screens", "collections", "themes"],
  properties: {
    appName: { type: "string" },
    summary: { type: "string" },
    screens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "title", "kind", "path", "purpose", "icon"],
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          kind: { type: "string", enum: ["tab", "stack"] },
          path: { type: "string" },
          purpose: { type: "string" },
          icon: { type: "string" },
        },
      },
    },
    collections: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "description", "fields"],
        properties: {
          name: { type: "string" },
          description: { type: "string" },
          fields: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["name", "type", "description"],
              properties: {
                name: { type: "string" },
                type: { type: "string", enum: ["string", "number", "boolean", "date"] },
                description: { type: "string" },
              },
            },
          },
        },
      },
    },
    themes: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "name", "mood", "dark", "primary"],
        properties: {
          id: { type: "string" },
          name: { type: "string" },
          mood: { type: "string" },
          dark: { type: "boolean" },
          primary: { type: "string" },
        },
      },
    },
  },
} as const;

const SLUG = /[^a-z0-9]+/g;

export function slugify(value: string): string {
  return value.toLowerCase().replace(SLUG, "-").replace(/^-|-$/g, "") || "item";
}

/**
 * Make a model-proposed plan safe to build: valid paths, exactly one home tab at
 * app/(tabs)/index.tsx, 2–5 tabs, unique keys, a screen cap, and exactly 5 themes.
 * Returns the fixed plan and a list of the fixes made (for logs).
 */
export function normalizePlan(
  input: AppPlan,
  options: { maxScreens: number },
): { plan: AppPlan; fixes: string[] } {
  const fixes: string[] = [];
  const seenKeys = new Set<string>();
  const seenPaths = new Set<string>();
  const screens: PlanScreen[] = [];

  for (const raw of input.screens) {
    let key = slugify(raw.key || raw.title);
    while (seenKeys.has(key)) key = `${key}-2`;
    let path = raw.path.trim().replace(/^\/+/, "");
    if (!/^app\/.+\.tsx$/.test(path) || path.includes("..") || path.endsWith("_layout.tsx")) {
      const fixed = raw.kind === "tab" ? `app/(tabs)/${key}.tsx` : `app/${key}.tsx`;
      fixes.push(`screen "${raw.title}": path "${raw.path}" -> "${fixed}"`);
      path = fixed;
    }
    if (raw.kind === "tab" && !path.startsWith("app/(tabs)/")) {
      const fixed = `app/(tabs)/${key}.tsx`;
      fixes.push(`tab "${raw.title}": moved to ${fixed}`);
      path = fixed;
    }
    if (raw.kind === "stack" && path.startsWith("app/(tabs)/")) {
      const fixed = path.replace("app/(tabs)/", "app/");
      fixes.push(`stack screen "${raw.title}": moved to ${fixed}`);
      path = fixed;
    }
    if (seenPaths.has(path)) {
      fixes.push(`dropped duplicate path ${path}`);
      continue;
    }
    seenKeys.add(key);
    seenPaths.add(path);
    screens.push({ ...raw, key, path, icon: raw.icon || "ellipse-outline" });
  }

  let tabs = screens.filter((s) => s.kind === "tab");
  if (tabs.length === 0 && screens[0]) {
    screens[0] = { ...screens[0], kind: "tab", path: "app/(tabs)/index.tsx" };
    fixes.push(`made "${screens[0].title}" the home tab`);
  }
  tabs = screens.filter((s) => s.kind === "tab");
  if (!tabs.some((s) => s.path === "app/(tabs)/index.tsx") && tabs[0]) {
    const i = screens.indexOf(tabs[0]);
    screens[i] = { ...tabs[0], path: "app/(tabs)/index.tsx" };
    fixes.push(`"${tabs[0].title}" is now the home tab (app/(tabs)/index.tsx)`);
  }

  let kept = screens;
  const tabCount = kept.filter((s) => s.kind === "tab").length;
  if (tabCount > 5) {
    const extraTabs = kept.filter((s) => s.kind === "tab").slice(5);
    kept = kept.filter((s) => !extraTabs.includes(s));
    fixes.push(`kept the first 5 tabs`);
  }
  if (kept.length > options.maxScreens) {
    // Keep the home tab, then the plan's order.
    const home = kept.find((s) => s.path === "app/(tabs)/index.tsx")!;
    kept = [home, ...kept.filter((s) => s !== home)].slice(0, options.maxScreens);
    fixes.push(`kept ${options.maxScreens} screens (plan limit)`);
  }

  const themes = input.themes.slice(0, 5).map((t, i) => ({
    ...t,
    id: slugify(t.id || t.name) || `theme-${i + 1}`,
    primary: /^#[0-9a-f]{6}$/i.test(t.primary) ? t.primary : "#4F46E5",
  }));
  while (themes.length < 5) {
    const i = themes.length + 1;
    themes.push({
      id: `theme-${i}`,
      name: `Theme ${i}`,
      mood: "neutral",
      dark: i % 2 === 0,
      primary: "#4F46E5",
    });
    fixes.push(`added placeholder theme ${i}`);
  }

  const collections = input.collections.map((c) => ({
    ...c,
    name: slugify(c.name).replace(/-/g, "_"),
  }));

  return {
    plan: {
      ...input,
      appName: input.appName.trim() || "My App",
      screens: kept,
      themes,
      collections,
    },
    fixes,
  };
}
