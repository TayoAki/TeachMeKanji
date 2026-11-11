/**
 * Promo videos of a generated app: a short Product Film (the Sizzle method) made from the app's
 * real screens. The promo_storyboard run writes the storyboard, the owner edits it in the
 * builder, and the promo_render run films it. Pure data and timing, shared by the model step,
 * the editor and the renderer, so every frame is a function of the storyboard alone.
 */
import { STRUCTURE_SCREENS } from "./app-structure";
import { buildRouteTree, screens as listScreens } from "./routes";

export type PromoFormat = "vertical" | "landscape";

export const PROMO_FORMATS: Record<
  PromoFormat,
  { width: number; height: number; fps: number; label: string; use: string }
> = {
  vertical: {
    width: 1080,
    height: 1920,
    fps: 30,
    label: "Vertical 9:16",
    use: "TikTok, Reels and Shorts, with a text hook and captions",
  },
  landscape: {
    width: 1920,
    height: 1080,
    fps: 30,
    label: "Landscape 16:9",
    use: "Your website, X and YouTube; it reads without sound",
  },
};

/**
 * Screens a promo can show, in the app's order: not settings, and not the paywall (in the
 * preview it shows test-mode purchases, which a promo must not pass off as real).
 */
export function promoScreens(paths: readonly string[]): string[] {
  return listScreens(buildRouteTree([...paths]))
    .map((s) => s.screen.file)
    .filter((file) => file !== STRUCTURE_SCREENS.settings && file !== STRUCTURE_SCREENS.paywall);
}

export function isPromoFormat(value: unknown): value is PromoFormat {
  return value === "vertical" || value === "landscape";
}

/** Where the camera pushes in on a screen once it has been shown whole. */
export type PromoFocus = "top" | "middle" | "bottom";

export interface PromoBeat {
  /** The screen file to show, e.g. "app/(tabs)/index.tsx". */
  screen: string;
  /** One benefit, said plainly: at most PROMO_LIMITS.caption characters. */
  caption: string;
  focus: PromoFocus;
}

export interface PromoStoryboard {
  /** The text hook on screen from the first frame (3–7 words). */
  hook: string;
  /** The screens in story order; the last one is the payoff and holds longest. */
  beats: PromoBeat[];
  /** The line under the app's name on the closing card. */
  tagline: string;
  /** The one call to action on the closing card. Only claims that are true. */
  cta: string;
}

export const PROMO_LIMITS = {
  hook: 32,
  caption: 40,
  tagline: 40,
  cta: 28,
  minBeats: 2,
  maxBeats: 5,
} as const;

/** Truthful default: the app may not be in the stores yet. */
export const PROMO_DEFAULT_CTA = "Coming soon to iPhone";

export const PROMO_STORYBOARD_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["hook", "beats", "tagline", "cta"],
  properties: {
    hook: { type: "string" },
    beats: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["screen", "caption", "focus"],
        properties: {
          screen: { type: "string" },
          caption: { type: "string" },
          focus: { type: "string", enum: ["top", "middle", "bottom"] },
        },
      },
    },
    tagline: { type: "string" },
    cta: { type: "string" },
  },
} as const;

/** Trim to `max` characters at a word boundary, without a trailing comma or dash. */
function cut(text: unknown, max: number): string {
  const value = String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (value.length <= max) return value;
  const clipped = value.slice(0, max + 1);
  const space = clipped.lastIndexOf(" ");
  return (space > max * 0.5 ? clipped.slice(0, space) : value.slice(0, max))
    .replace(/[\s,;:–—-]+$/, "")
    .trim();
}

/**
 * Clean a storyboard from the model or the editor: known screens only (each once), every text
 * within its limit, at most PROMO_LIMITS.maxBeats beats. Use promoProblems() to check it's
 * complete enough to film.
 */
export function normalizeStoryboard(raw: unknown, screens: readonly string[]): PromoStoryboard {
  const input = (raw && typeof raw === "object" ? raw : {}) as Partial<
    Record<keyof PromoStoryboard, unknown>
  >;
  const known = new Set(screens);
  const seen = new Set<string>();
  const beats: PromoBeat[] = [];
  for (const item of Array.isArray(input.beats) ? input.beats : []) {
    const beat = (item && typeof item === "object" ? item : {}) as Record<string, unknown>;
    const screen = String(beat.screen ?? "");
    if (!known.has(screen) || seen.has(screen)) continue;
    seen.add(screen);
    const focus = beat.focus === "top" || beat.focus === "bottom" ? beat.focus : "middle";
    beats.push({ screen, caption: cut(beat.caption, PROMO_LIMITS.caption), focus });
    if (beats.length === PROMO_LIMITS.maxBeats) break;
  }
  return {
    hook: cut(input.hook, PROMO_LIMITS.hook),
    beats,
    tagline: cut(input.tagline, PROMO_LIMITS.tagline),
    cta: cut(input.cta, PROMO_LIMITS.cta) || PROMO_DEFAULT_CTA,
  };
}

/** What still stops a storyboard from being filmed, in plain words (empty when it's ready). */
export function promoProblems(storyboard: PromoStoryboard): string[] {
  const problems: string[] = [];
  if (!storyboard.hook) problems.push("Write the hook: the words on screen from the first frame.");
  if (storyboard.beats.length < PROMO_LIMITS.minBeats)
    problems.push(`Pick at least ${PROMO_LIMITS.minBeats} screens.`);
  storyboard.beats.forEach((beat, i) => {
    if (!beat.caption) problems.push(`Write a caption for screen ${i + 1}.`);
  });
  return problems;
}

/** Seconds a line needs on screen: about 4 words a second, plus time to land. */
function readSeconds(text: string, min: number, max: number): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.min(max, Math.max(min, words / 4 + 1.6));
}

export interface PromoSegment {
  start: number;
  end: number;
}

export interface PromoTimeline {
  /** One per beat, back to back from frame 0 (the first beat carries the hook). */
  beats: PromoSegment[];
  /** The one marquee: every screen side by side. */
  marquee: PromoSegment;
  close: PromoSegment;
  /** Total length in seconds. */
  duration: number;
}

/**
 * The film's timing in seconds. Each beat holds long enough to read its caption, the last
 * one (the payoff) a little longer; one marquee pulls back to all the screens; the close holds
 * clean on the app's name and the call to action.
 */
export function promoTimeline(storyboard: PromoStoryboard): PromoTimeline {
  const beats: PromoSegment[] = [];
  let t = 0;
  storyboard.beats.forEach((beat, i) => {
    const last = i === storyboard.beats.length - 1;
    const length = readSeconds(beat.caption, 2.8, 4.2) + (last ? 0.6 : 0) + (i === 0 ? 0.4 : 0);
    beats.push({ start: t, end: t + length });
    t += length;
  });
  const marquee = { start: t, end: t + 2.8 };
  t = marquee.end;
  const close = { start: t, end: t + readSeconds(`${storyboard.tagline} ${storyboard.cta}`, 3, 4) };
  return { beats, marquee, close, duration: close.end };
}

/** A theme's colors as the film uses them (hex or rgb strings from the app's theme). */
export interface PromoColors {
  background: string;
  surface: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
}

const COLOR = /^(#[0-9a-f]{3,8}|rgba?\([\d\s.,%]+\)|hsla?\([\d\s.,%deg]+\))$/i;

/** Keep only well-formed colors; anything else falls back to a neutral dark palette. */
export function normalizePromoColors(raw: unknown): PromoColors {
  const input = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const pick = (key: keyof PromoColors, fallback: string) => {
    const value = String(input[key] ?? "").trim();
    return COLOR.test(value) ? value : fallback;
  };
  return {
    background: pick("background", "#0b0b0f"),
    surface: pick("surface", "#17171d"),
    text: pick("text", "#f5f5f7"),
    textMuted: pick("textMuted", "#a1a1aa"),
    primary: pick("primary", "#6366f1"),
    onPrimary: pick("onPrimary", "#ffffff"),
  };
}
