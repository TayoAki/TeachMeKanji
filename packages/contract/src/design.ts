/**
 * Design-first builds: before an app is built, the builder researches the idea, sets a visual
 * direction, draws a mockup of every screen (and a mascot when the app suits one), and the user
 * approves them. The build then follows the approved mockups. These are the shapes shared by
 * the worker (which writes them), the web app (which shows them) and the build (which reads them).
 */
import type { AppPlan } from "./app-plan";

// --- Research ------------------------------------------------------------------------------

export interface ResearchCompetitor {
  name: string;
  whatPeopleLove: string[];
  complaints: string[];
}

/** What the web says about the idea, condensed for the planner. */
export interface ResearchBrief {
  competitors: ResearchCompetitor[];
  mustHaveFeatures: string[];
  differentiators: string[];
  signatureInteractionIdeas: string[];
  /** At most ~900 characters: the features and angle the planner should use. */
  brief: string;
}

const strings = (value: unknown, max: number, each = 200): string[] =>
  Array.isArray(value)
    ? value
        .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.trim().slice(0, each))
        .slice(0, max)
    : [];

/** Accept whatever the researcher returned; null when there's nothing usable. */
export function normalizeResearch(raw: unknown): ResearchBrief | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const brief = typeof r.brief === "string" ? r.brief.trim().slice(0, 1200) : "";
  const competitors = Array.isArray(r.competitors)
    ? r.competitors
        .filter((c): c is Record<string, unknown> => Boolean(c) && typeof c === "object")
        .map((c) => ({
          name: String(c.name ?? "").slice(0, 80),
          whatPeopleLove: strings(c.whatPeopleLove, 4),
          complaints: strings(c.complaints, 4),
        }))
        .filter((c) => c.name)
        .slice(0, 8)
    : [];
  if (!brief && competitors.length === 0) return null;
  return {
    competitors,
    mustHaveFeatures: strings(r.mustHaveFeatures, 10),
    differentiators: strings(r.differentiators, 6),
    signatureInteractionIdeas: strings(r.signatureInteractionIdeas, 4),
    brief,
  };
}

// --- Design direction ----------------------------------------------------------------------

export interface DesignPalette {
  background: string;
  surface: string;
  text: string;
  mutedText: string;
  primary: string;
  accent: string;
  success: string;
}

export interface DesignMascot {
  name: string;
  /** A precise visual description an illustrator could draw from. */
  look: string;
  personality: string;
  poses: Array<{ name: string; description: string }>;
}

export interface DesignDirection {
  styleName: string;
  summary: string;
  palette: DesignPalette;
  typography: { display: string; body: string; notes: string };
  shape: { cornerRadius: number; cards: string; shadows: string };
  illustrationStyle: string;
  motion: {
    personality: string;
    signatureInteraction: { name: string; screen: string; description: string; howItMoves: string };
    perScreen: Array<{ path: string; moments: string[] }>;
  };
  /** Null when the app doesn't suit a character. */
  mascot: DesignMascot | null;
  /** One brief per plan screen, in the plan's order. */
  screens: Array<{ path: string; title: string; mockupBrief: string }>;
}

export const DESIGN_LIMITS = {
  minPoses: 2,
  maxPoses: 4,
  noteChars: 500,
  briefChars: 1500,
} as const;

const hex = (value: unknown, fallback: string): string =>
  typeof value === "string" && /^#[0-9a-fA-F]{6}$/.test(value.trim()) ? value.trim() : fallback;
const text = (value: unknown, max: number, fallback = ""): string =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;

/** JSON schema for structured outputs (every object closed, every property required). */
export const DESIGN_DIRECTION_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "styleName",
    "summary",
    "palette",
    "typography",
    "shape",
    "illustrationStyle",
    "motion",
    "mascot",
    "screens",
  ],
  properties: {
    styleName: { type: "string" },
    summary: { type: "string" },
    palette: {
      type: "object",
      additionalProperties: false,
      required: ["background", "surface", "text", "mutedText", "primary", "accent", "success"],
      properties: Object.fromEntries(
        ["background", "surface", "text", "mutedText", "primary", "accent", "success"].map((k) => [
          k,
          { type: "string" },
        ]),
      ),
    },
    typography: {
      type: "object",
      additionalProperties: false,
      required: ["display", "body", "notes"],
      properties: {
        display: { type: "string" },
        body: { type: "string" },
        notes: { type: "string" },
      },
    },
    shape: {
      type: "object",
      additionalProperties: false,
      required: ["cornerRadius", "cards", "shadows"],
      properties: {
        cornerRadius: { type: "number" },
        cards: { type: "string" },
        shadows: { type: "string" },
      },
    },
    illustrationStyle: { type: "string" },
    motion: {
      type: "object",
      additionalProperties: false,
      required: ["personality", "signatureInteraction", "perScreen"],
      properties: {
        personality: { type: "string" },
        signatureInteraction: {
          type: "object",
          additionalProperties: false,
          required: ["name", "screen", "description", "howItMoves"],
          properties: {
            name: { type: "string" },
            screen: { type: "string" },
            description: { type: "string" },
            howItMoves: { type: "string" },
          },
        },
        perScreen: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["path", "moments"],
            properties: {
              path: { type: "string" },
              moments: { type: "array", items: { type: "string" } },
            },
          },
        },
      },
    },
    mascot: {
      type: "object",
      additionalProperties: false,
      required: ["use", "name", "look", "personality", "poses"],
      properties: {
        use: { type: "boolean" },
        name: { type: "string" },
        look: { type: "string" },
        personality: { type: "string" },
        poses: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["name", "description"],
            properties: { name: { type: "string" }, description: { type: "string" } },
          },
        },
      },
    },
    screens: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["path", "title", "mockupBrief"],
        properties: {
          path: { type: "string" },
          title: { type: "string" },
          mockupBrief: { type: "string" },
        },
      },
    },
  },
} as const;

/** A pose name usable as an image name in code (`<AiImage name="sippo-happy" />`). */
export function poseImageName(mascotName: string, pose: string): string {
  const slug = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  const name = `${slug(mascotName) || "mascot"}-${slug(pose) || "pose"}`;
  return /^[a-z]/.test(name) ? name.slice(0, 40) : `m-${name}`.slice(0, 40);
}

/**
 * Make the designer's answer safe to use: valid colors, sensible sizes, and exactly one brief
 * per plan screen in the plan's order (missing ones fall back to the screen's purpose).
 */
export function normalizeDirection(raw: unknown, plan: AppPlan): DesignDirection {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const p = (r.palette ?? {}) as Record<string, unknown>;
  const primary = hex(p.primary, plan.themes[0]?.primary ?? "#3B6EF5");
  const typo = (r.typography ?? {}) as Record<string, unknown>;
  const shape = (r.shape ?? {}) as Record<string, unknown>;
  const motion = (r.motion ?? {}) as Record<string, unknown>;
  const sig = (motion.signatureInteraction ?? {}) as Record<string, unknown>;
  const m = (r.mascot ?? {}) as Record<string, unknown>;
  const poses = Array.isArray(m.poses)
    ? m.poses
        .map((pose) => pose as Record<string, unknown>)
        .map((pose) => ({ name: text(pose.name, 24), description: text(pose.description, 400) }))
        .filter((pose) => pose.name && pose.description)
        .filter((pose, i, all) => all.findIndex((o) => o.name === pose.name) === i)
        .slice(0, DESIGN_LIMITS.maxPoses)
    : [];
  const mascot =
    m.use === true && text(m.name, 30) && text(m.look, 10) && poses.length >= DESIGN_LIMITS.minPoses
      ? {
          name: text(m.name, 30),
          look: text(m.look, 600),
          personality: text(m.personality, 300),
          poses,
        }
      : null;
  const briefs = new Map<string, Record<string, unknown>>();
  if (Array.isArray(r.screens))
    for (const s of r.screens as Array<Record<string, unknown>>)
      if (typeof s?.path === "string") briefs.set(s.path, s);
  const perScreen = Array.isArray(motion.perScreen)
    ? (motion.perScreen as Array<Record<string, unknown>>)
        .filter((s) => typeof s?.path === "string")
        .map((s) => ({ path: String(s.path), moments: strings(s.moments, 5, 240) }))
    : [];
  return {
    styleName: text(r.styleName, 60, "Signature"),
    summary: text(r.summary, 400),
    palette: {
      background: hex(p.background, "#FFFFFF"),
      surface: hex(p.surface, "#F5F5F7"),
      text: hex(p.text, "#111111"),
      mutedText: hex(p.mutedText, "#6B6B70"),
      primary,
      accent: hex(p.accent, primary),
      success: hex(p.success, "#2E9E5B"),
    },
    typography: {
      display: text(typo.display, 60, "System"),
      body: text(typo.body, 60, "System"),
      notes: text(typo.notes, 600),
    },
    shape: {
      cornerRadius: Math.min(40, Math.max(0, Math.round(Number(shape.cornerRadius) || 16))),
      cards: text(shape.cards, 300),
      shadows: text(shape.shadows, 300),
    },
    illustrationStyle: text(r.illustrationStyle, 400),
    motion: {
      personality: text(motion.personality, 300),
      signatureInteraction: {
        name: text(sig.name, 60),
        screen: text(sig.screen, 120),
        description: text(sig.description, 400),
        howItMoves: text(sig.howItMoves, 500),
      },
      perScreen,
    },
    mascot,
    screens: plan.screens.map((s) => {
      const b = briefs.get(s.path);
      return {
        path: s.path,
        title: text(b?.title, 60, s.title),
        mockupBrief: text(b?.mockupBrief, DESIGN_LIMITS.briefChars, s.purpose),
      };
    }),
  };
}

/** The screen to draw first and match the rest to: the main tab, else the first screen. */
export function keyScreenPath(plan: AppPlan): string | undefined {
  return (
    plan.screens.find((s) => s.path === "app/(tabs)/index.tsx")?.path ??
    plan.screens.find((s) => s.role === "main")?.path ??
    plan.screens[0]?.path
  );
}

// --- What the web app shows ----------------------------------------------------------------

export type DesignItemState = "pending" | "approved" | "changes";

export interface DesignView {
  id: string;
  planId: string;
  status: "generating" | "ready" | "failed";
  error: string | null;
  styleName: string | null;
  summary: string | null;
  fonts: string | null;
  palette: DesignPalette | null;
  signature: string | null;
  mascot: {
    name: string;
    status: DesignItemState;
    note: string;
    poses: Array<{ name: string; url: string | null }>;
  } | null;
  screens: Array<{
    path: string;
    title: string;
    url: string | null;
    status: DesignItemState;
    note: string;
    version: number;
  }>;
  /** Every screen (and the mascot) approved: the build can start. */
  approved: boolean;
}
