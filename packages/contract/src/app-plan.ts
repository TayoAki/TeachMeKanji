/**
 * The plan the agent proposes before building: the product (who it's for, its angle, the core
 * loop, onboarding, what premium unlocks), the screens, data collections and theme ideas. The
 * user revises it in chat, then confirms it to start a build.
 */
import {
  DEFAULT_OFFERS,
  STRUCTURE_SCREENS,
  structureRoleOf,
  type PlanMonetization,
  type PlanOffer,
  type ScreenRole,
  type StructureRole,
} from "./app-structure";

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
  /** Which of the app's four parts it belongs to. */
  role: ScreenRole;
}

export interface PlanOnboardingStep {
  /** value: what the app does for you; question: personalize (saved as an answer);
   * demo: try the core action once; permission: explain before asking. */
  kind: "value" | "question" | "demo" | "permission";
  title: string;
  body: string;
  /** Choices for a question step; [] otherwise. */
  options: string[];
  /** Where a question's answer is saved (useAppState().answers[key]); "" otherwise. */
  answerKey: string;
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
  /** Who it's for, in one line. */
  audience: string;
  /** What makes it distinct: the personal story or point of view behind it. */
  angle: string;
  /** The one action people come back to repeat. */
  coreLoop: string;
  /** A result worth screenshotting or sharing. */
  shareMoment: string;
  onboarding: { steps: PlanOnboardingStep[] };
  monetization: PlanMonetization;
  screens: PlanScreen[];
  collections: PlanCollection[];
  themes: PlanTheme[];
}

/** JSON schema for structured outputs (every object closed, every property required). */
export const APP_PLAN_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "appName",
    "summary",
    "audience",
    "angle",
    "coreLoop",
    "shareMoment",
    "onboarding",
    "monetization",
    "screens",
    "collections",
    "themes",
  ],
  properties: {
    appName: { type: "string" },
    summary: { type: "string" },
    audience: { type: "string" },
    angle: { type: "string" },
    coreLoop: { type: "string" },
    shareMoment: { type: "string" },
    onboarding: {
      type: "object",
      additionalProperties: false,
      required: ["steps"],
      properties: {
        steps: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["kind", "title", "body", "options", "answerKey"],
            properties: {
              kind: { type: "string", enum: ["value", "question", "demo", "permission"] },
              title: { type: "string" },
              body: { type: "string" },
              options: { type: "array", items: { type: "string" } },
              answerKey: { type: "string" },
            },
          },
        },
      },
    },
    monetization: {
      type: "object",
      additionalProperties: false,
      required: ["premiumFeatures", "offers"],
      properties: {
        premiumFeatures: { type: "array", items: { type: "string" } },
        offers: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "label", "price", "period", "trialDays", "badge"],
            properties: {
              id: { type: "string" },
              label: { type: "string" },
              price: { type: "string" },
              period: { type: "string", enum: ["week", "month", "year", "lifetime"] },
              trialDays: { type: "integer" },
              badge: { type: "string" },
            },
          },
        },
      },
    },
    screens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["key", "title", "kind", "path", "purpose", "icon", "role"],
        properties: {
          key: { type: "string" },
          title: { type: "string" },
          kind: { type: "string", enum: ["tab", "stack"] },
          path: { type: "string" },
          purpose: { type: "string" },
          icon: { type: "string" },
          role: { type: "string", enum: ["onboarding", "paywall", "main", "settings"] },
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

const STRUCTURE_DEFAULTS: Record<StructureRole, Pick<PlanScreen, "title" | "purpose" | "icon">> = {
  onboarding: {
    title: "Welcome",
    purpose:
      "First launch: show what the app does for you in a few short steps, ask what it needs to personalize, and finish into the app.",
    icon: "sparkles-outline",
  },
  paywall: {
    title: "Premium",
    purpose:
      "Explain what premium unlocks, show the plans with clear prices and trial terms, and let people buy, restore or close.",
    icon: "star-outline",
  },
  settings: {
    title: "Settings",
    purpose:
      "Subscription status with restore and manage, preferences, support, privacy and terms, and the app version.",
    icon: "settings-outline",
  },
};

const ROLES: readonly ScreenRole[] = ["onboarding", "paywall", "main", "settings"];
const PERIODS: readonly PlanOffer["period"][] = ["week", "month", "year", "lifetime"];
const STEP_KINDS: readonly PlanOnboardingStep["kind"][] = [
  "value",
  "question",
  "demo",
  "permission",
];

function cleanText(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value.trim() : fallback;
}

function normalizeOnboarding(input: AppPlan["onboarding"] | undefined, fixes: string[]) {
  const steps = (input?.steps ?? [])
    .filter((step) => step && cleanText(step.title))
    .slice(0, 5)
    .map((step) => {
      const kind = STEP_KINDS.includes(step.kind) ? step.kind : "value";
      const options =
        kind === "question"
          ? (step.options ?? [])
              .map((o) => cleanText(o))
              .filter(Boolean)
              .slice(0, 6)
          : [];
      return {
        kind,
        title: cleanText(step.title),
        body: cleanText(step.body),
        options,
        answerKey:
          kind === "question" ? slugify(step.answerKey || step.title).replace(/-/g, "_") : "",
      };
    });
  if (steps.length === 0) {
    fixes.push("added a default onboarding step");
    steps.push({ kind: "value", title: "Welcome", body: "", options: [], answerKey: "" });
  }
  return { steps };
}

function normalizeMonetization(
  input: PlanMonetization | undefined,
  fixes: string[],
): PlanMonetization {
  const seen = new Set<string>();
  const offers = (input?.offers ?? [])
    .map((offer) => ({
      id: slugify(offer.id || offer.label),
      label: cleanText(offer.label) || cleanText(offer.id),
      price: cleanText(offer.price),
      period: PERIODS.includes(offer.period) ? offer.period : "month",
      trialDays: Math.max(0, Math.min(30, Math.round(Number(offer.trialDays) || 0))),
      badge: cleanText(offer.badge).slice(0, 24),
    }))
    .filter((offer) => offer.label && offer.price && !seen.has(offer.id) && seen.add(offer.id))
    .slice(0, 3);
  if (offers.length === 0) fixes.push("added default premium offers");
  return {
    premiumFeatures: (input?.premiumFeatures ?? [])
      .map((f) => cleanText(f))
      .filter(Boolean)
      .slice(0, 6),
    offers: offers.length ? offers : DEFAULT_OFFERS.map((o) => ({ ...o })),
  };
}

/**
 * Make a model-proposed (or older, stored) plan safe to build: exactly one onboarding, paywall
 * and settings screen at their fixed routes; for the main screens, valid paths, exactly one home
 * tab at app/(tabs)/index.tsx, 2–5 tabs, unique keys and the screen cap (structure screens don't
 * count toward it); 1–5 onboarding steps, 1–3 offers and exactly 5 themes.
 * Returns the fixed plan and a list of the fixes made (for logs).
 */
export function normalizePlan(
  input: AppPlan,
  options: { maxScreens: number },
): { plan: AppPlan; fixes: string[] } {
  const fixes: string[] = [];
  const structure: Partial<Record<StructureRole, PlanScreen>> = {};
  // Structure screens own these keys; a main screen using one is renamed.
  const seenKeys = new Set<string>(Object.keys(STRUCTURE_SCREENS));
  const seenPaths = new Set<string>(Object.values(STRUCTURE_SCREENS));
  const screens: PlanScreen[] = [];

  for (const raw of input.screens ?? []) {
    const rawPath = cleanText(raw.path).replace(/^\/+/, "");
    const byPath = structureRoleOf(rawPath);
    let role: ScreenRole = ROLES.includes(raw.role) ? raw.role : (byPath ?? "main");
    if (role === "main" && byPath) role = byPath;
    if (role !== "main") {
      if (structure[role]) {
        fixes.push(`dropped a second ${role} screen "${raw.title}"`);
        continue;
      }
      const defaults = STRUCTURE_DEFAULTS[role];
      structure[role] = {
        key: role,
        title: cleanText(raw.title) || defaults.title,
        kind: "stack",
        path: STRUCTURE_SCREENS[role],
        purpose: cleanText(raw.purpose) || defaults.purpose,
        icon: raw.icon || defaults.icon,
        role,
      };
      continue;
    }

    let key = slugify(raw.key || raw.title);
    while (seenKeys.has(key)) key = `${key}-2`;
    let path = rawPath;
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
    screens.push({ ...raw, key, path, icon: raw.icon || "ellipse-outline", role: "main" });
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

  for (const role of Object.keys(STRUCTURE_SCREENS) as StructureRole[]) {
    if (structure[role]) continue;
    fixes.push(`added the ${role} screen`);
    structure[role] = {
      key: role,
      ...STRUCTURE_DEFAULTS[role],
      kind: "stack",
      path: STRUCTURE_SCREENS[role],
      role,
    };
  }

  const themes = (input.themes ?? []).slice(0, 5).map((t, i) => ({
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

  const collections = (input.collections ?? []).map((c) => ({
    ...c,
    name: slugify(c.name).replace(/-/g, "_"),
  }));

  return {
    plan: {
      ...input,
      appName: cleanText(input.appName) || "My App",
      summary: cleanText(input.summary),
      audience: cleanText(input.audience),
      angle: cleanText(input.angle),
      coreLoop: cleanText(input.coreLoop),
      shareMoment: cleanText(input.shareMoment),
      onboarding: normalizeOnboarding(input.onboarding, fixes),
      monetization: normalizeMonetization(input.monetization, fixes),
      // The user's journey: first launch, the paywall, the app, then settings.
      screens: [structure.onboarding!, structure.paywall!, ...kept, structure.settings!],
      themes,
      collections,
    },
    fixes,
  };
}
