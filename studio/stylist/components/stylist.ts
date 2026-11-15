// The stylist: picks outfits from the closet (the AI first, the rules below when it can't), tags
// a photographed piece, breaks down a scanned look against the closet, and rates a fit.
import { askAI } from "../data/ai";
import type { Photo } from "../data/photos";
import {
  COLORS,
  categoryLabel,
  colorLabel,
  isNeutral,
  toCategory,
  toColorId,
  type Category,
  type Formality,
  type Item,
  type Occasion,
  type Piece,
  type Warmth,
} from "../data/schema";

export const STYLIST = [
  "You are Closetcast, a warm, practical personal stylist.",
  "You only talk about clothes, colors, fit, proportion and occasions.",
  "Never comment on a person's body, weight, face, skin or attractiveness, and never guess anyone's age.",
  "Be specific and brief, in plain words.",
].join(" ");

export interface OutfitPlan {
  itemIds: string[];
  title: string;
  why: string;
  source: "ai" | "rules";
}

export interface DayContext {
  tempC: number;
  rainChance: number;
  occasion: Occasion;
  /** Pieces worn in the last few days, to avoid repeating. */
  recentIds: Set<string>;
  styles: string[];
  wear: string;
  seed: number;
}

// --- Rules ---------------------------------------------------------------------------------

export function targetWarmth(tempC: number): Warmth {
  if (tempC >= 22) return 1;
  if (tempC >= 12) return 2;
  return 3;
}

export function targetFormality(occasion: Occasion): Formality {
  if (occasion === "work") return 2;
  if (occasion === "date") return 3;
  return 1;
}

/** A repeatable random number generator, so a reroll gives a new but stable option. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FAMILIES = [
  ["black", "charcoal"],
  ["white", "cream"],
  ["beige", "camel", "brown"],
  ["navy", "denim"],
  ["grey", "silver"],
];

function family(colorId: string): number {
  return FAMILIES.findIndex((f) => f.includes(colorId));
}

/** How well two pieces' main colors go together: neutrals with anything, careful with two colors. */
export function colorHarmony(a: Item, b: Item): number {
  const ca = a.colors[0] ?? "print";
  const cb = b.colors[0] ?? "print";
  const na = isNeutral(ca);
  const nb = isNeutral(cb);
  if (na && nb) return ca === cb && ca !== "denim" ? 0.4 : 1;
  if (na || nb) return 0.8;
  if (ca === "print" || cb === "print") return -0.6;
  return ca === cb ? -0.3 : -1;
}

export function pickOutfit(items: Item[], day: DayContext): Item[] {
  const roll = random(day.seed);
  const warmth = targetWarmth(day.tempC);
  const formality = targetFormality(day.occasion);
  const score = (item: Item) => {
    let s = 0;
    const warmthWeight = item.category === "outerwear" || item.category === "shoes" ? 1 : 2;
    s -= Math.abs(item.warmth - warmth) * warmthWeight;
    s -= Math.abs(item.formality - formality) * 1.6;
    if (day.occasion === "active" && item.formality > 1) s -= 3;
    if (day.recentIds.has(item.id)) s -= 2.5;
    if (item.favorite) s += 0.6;
    return s + roll() * 1.5;
  };
  const best = (category: Category, extra: (item: Item) => number = () => 0) =>
    items
      .filter((i) => i.category === category)
      .map((item) => ({ item, s: score(item) + extra(item) }))
      .sort((a, b) => b.s - a.s)[0]?.item ?? null;

  const dress = best("dress");
  const top = best("top");
  let base: Item[];
  if (dress && (!top || (warmth <= 2 && day.occasion !== "active" && roll() < 0.35))) {
    base = [dress];
  } else {
    if (!top) return [];
    const bottom = best("bottom", (b) => colorHarmony(top, b));
    if (!bottom) return [];
    base = [top, bottom];
  }
  const lead = base[0]!;
  const outfit = [...base];
  const shoes = best("shoes", (s) => colorHarmony(lead, s) * 0.5);
  if (shoes) outfit.push(shoes);
  if (day.tempC < 16 || day.rainChance >= 50) {
    const outer = best(
      "outerwear",
      (o) =>
        colorHarmony(lead, o) * 0.5 +
        (day.rainChance >= 50 && /trench|rain|parka|shell|mac/i.test(o.name) ? 1.2 : 0) +
        (day.tempC < 6 && o.warmth === 3 ? 1.5 : 0),
    );
    if (outer) outfit.push(outer);
  }
  const accessory = best("accessory", (a) =>
    day.tempC < 8 && /scarf|beanie|glove|hat/i.test(a.name) ? 1.5 : 0,
  );
  if (accessory && roll() > 0.45) outfit.push(accessory);
  return outfit;
}

const OCCASION_NOUN: Record<Occasion, string> = {
  everyday: "everyday look",
  work: "workday look",
  date: "date-night look",
  weekend: "weekend look",
  active: "active look",
};

function adjective(tempC: number): string {
  if (tempC >= 27) return "Featherlight";
  if (tempC >= 20) return "Breezy";
  if (tempC >= 13) return "Easy-layered";
  if (tempC >= 5) return "Cozy";
  return "Bundled-up";
}

/** A name and a reason for an outfit picked by the rules. */
export function describeOutfit(outfit: Item[], day: DayContext): { title: string; why: string } {
  const title = `${adjective(day.tempC)} ${OCCASION_NOUN[day.occasion]}`;
  const [lead, second] = outfit;
  const outer = outfit.find((i) => i.category === "outerwear");
  const parts: string[] = [];
  if (lead && lead.category === "dress") {
    parts.push(`The ${lead.name.toLowerCase()} does the work on its own.`);
  } else if (lead && second) {
    const harmony = colorHarmony(lead, second);
    parts.push(
      `${lead.name} with ${second.name.toLowerCase()}${
        harmony >= 1
          ? " is a quiet, easy pairing."
          : harmony > 0
            ? " lets one color lead."
            : " is a confident color mix."
      }`,
    );
  }
  if (outer) {
    const reason =
      day.rainChance >= 50
        ? `the ${Math.round(day.rainChance)}% chance of rain`
        : day.tempC < 10
          ? "the cold"
          : "the cooler hours";
    parts.push(`The ${outer.name.toLowerCase()} is there for ${reason}.`);
  } else if (day.tempC >= 24) {
    parts.push("No layers needed: it's warm out.");
  }
  return { title, why: parts.join(" ") };
}

/** True when the pieces make a wearable outfit: a dress, or a top and a bottom. */
export function isWearable(outfit: Item[]): boolean {
  const has = (c: Category) => outfit.some((i) => i.category === c);
  return has("dress") || (has("top") && has("bottom"));
}

// --- AI --------------------------------------------------------------------------------------

/** The first JSON object in an answer, or null. */
export function parseJson<T>(text: string): T | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function closetLines(items: Item[], limit: number): string {
  return items
    .slice(0, limit)
    .map(
      (i) =>
        `${i.id} | ${i.name} | ${i.category} | ${i.colors.map(colorLabel).join("/")} | ${i.warmth} | ${i.formality}`,
    )
    .join("\n");
}

const COLOR_NAMES = COLORS.map((c) => c.label.toLowerCase()).join(", ");

export async function aiOutfit(
  items: Item[],
  day: DayContext,
  recent: Item[],
): Promise<OutfitPlan | null> {
  const prompt = [
    "Closet (id | name | category | colors | warmth 1-3 | formality 1-3):",
    closetLines(items, 70),
    "",
    `Today: ${Math.round(day.tempC)}°C, ${Math.round(day.rainChance)}% chance of rain. Occasion: ${day.occasion}.`,
    `Their style: ${day.styles.join(", ") || "not said"}. They wear: ${day.wear || "not said"}.`,
    recent.length
      ? `Worn in the last few days (avoid repeating): ${recent.map((i) => i.name).join(", ")}.`
      : "",
    "Pick one outfit using only pieces from the closet: a top and a bottom (or one dress), shoes, outerwear if it's under 16°C or rain is likely, and at most one accessory.",
    'Reply as JSON: {"itemIds": ["..."], "title": "a 3 to 5 word name", "why": "one or two sentences on why it works today"}',
  ]
    .filter(Boolean)
    .join("\n");
  const answer = parseJson<{ itemIds?: string[]; title?: string; why?: string }>(
    await askAI({ prompt, instructions: STYLIST, json: true }),
  );
  const ids = (answer?.itemIds ?? []).filter((id, i, all) => all.indexOf(id) === i);
  const picked = ids
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is Item => Boolean(i));
  if (!answer || !isWearable(picked) || picked.length > 6) return null;
  return {
    itemIds: picked.map((i) => i.id),
    title: (answer.title ?? "").slice(0, 48) || "Today's look",
    why: (answer.why ?? "").slice(0, 280),
    source: "ai",
  };
}

export interface TaggedItem {
  name: string;
  category: Category;
  colors: string[];
  warmth: Warmth;
  formality: Formality;
}

const level = (n: unknown): 1 | 2 | 3 => (n === 1 || n === 2 || n === 3 ? n : 2);

/** What a photographed piece is; null when the photo shows no clothing. */
export async function tagPhoto(photo: Photo): Promise<TaggedItem | null> {
  const answer = parseJson<{
    isClothing?: boolean;
    name?: string;
    category?: string;
    colors?: string[];
    warmth?: number;
    formality?: number;
  }>(
    await askAI({
      prompt: [
        "Identify the one main piece of clothing, footwear or accessory in this photo.",
        `Use only these color names: ${COLOR_NAMES}.`,
        'Reply as JSON: {"isClothing": true, "name": "2 to 4 words with color and material, e.g. Cream cable-knit sweater", "category": "top | bottom | dress | outerwear | shoes | accessory", "colors": ["main color", "optional second color"], "warmth": 1 (light) | 2 (mid-weight) | 3 (warm), "formality": 1 (casual) | 2 (smart) | 3 (dressy)}',
        'If there is no clothing in the photo, reply {"isClothing": false}.',
      ].join("\n"),
      instructions: STYLIST,
      photo,
      json: true,
    }),
  );
  if (!answer || answer.isClothing === false || !answer.name) return null;
  const colors = (answer.colors ?? []).map(toColorId).filter((c, i, all) => all.indexOf(c) === i);
  return {
    name: answer.name.slice(0, 40),
    category: answer.category ? toCategory(answer.category) : toCategory(answer.name),
    colors: colors.length ? colors.slice(0, 2) : ["print"],
    warmth: level(answer.warmth),
    formality: level(answer.formality),
  };
}

export interface ScannedLook {
  title: string;
  pieces: Piece[];
}

/** The pieces of an outfit in a photo or screenshot; null when there's no outfit in it. */
export async function scanLook(photo: Photo, wear: string): Promise<ScannedLook | null> {
  const answer = parseJson<{
    isOutfit?: boolean;
    title?: string;
    pieces?: {
      name?: string;
      category?: string;
      color?: string;
      details?: string;
      query?: string;
    }[];
  }>(
    await askAI({
      prompt: [
        "List the clothing pieces, shoes and accessories visible in this outfit photo or screenshot. Describe the clothes only, not the person.",
        `Use only these color names: ${COLOR_NAMES}.`,
        wear ? `The shopper usually buys ${wear}; word the searches for that.` : "",
        'Reply as JSON: {"isOutfit": true, "title": "a 3 to 5 word name for the look\'s style", "pieces": [{"name": "e.g. Double-breasted wool blazer", "category": "top | bottom | dress | outerwear | shoes | accessory", "color": "one color name", "details": "one short phrase: material, cut, notable details", "query": "a precise shopping search, e.g. oversized beige wool blazer double breasted"}]}',
        "At most 6 pieces, the most visible first.",
        'If there is no outfit in the image, reply {"isOutfit": false}.',
      ]
        .filter(Boolean)
        .join("\n"),
      instructions: STYLIST,
      photo,
      json: true,
    }),
  );
  if (!answer || answer.isOutfit === false) return null;
  const pieces = (answer.pieces ?? [])
    .filter((p) => p.name)
    .slice(0, 6)
    .map((p) => ({
      name: p.name!.slice(0, 48),
      category: toCategory(p.category ?? p.name!),
      shade: toColorId(p.color ?? "print"),
      details: (p.details ?? "").slice(0, 120),
      query: (p.query || `${p.color ?? ""} ${p.name}`).trim().slice(0, 100),
    }));
  if (!pieces.length) return null;
  return { title: (answer.title ?? "").slice(0, 48) || "Scanned look", pieces };
}

export type ClosetMatch = { item: Item; exact: boolean } | null;

/** The kind of garment a name describes ("Double-breasted wool blazer" -> "blazer"), or "". */
const GARMENTS = [
  "t-shirt",
  "tee",
  "tank",
  "polo",
  "blouse",
  "shirt",
  "turtleneck",
  "crewneck",
  "cardigan",
  "hoodie",
  "sweatshirt",
  "sweater",
  "knit",
  "jeans",
  "chinos",
  "trousers",
  "pants",
  "leggings",
  "shorts",
  "skirt",
  "jumpsuit",
  "dress",
  "blazer",
  "trench",
  "parka",
  "puffer",
  "coat",
  "jacket",
  "sneakers",
  "trainers",
  "boots",
  "loafers",
  "heels",
  "sandals",
  "flats",
  "mules",
  "tote",
  "bag",
  "scarf",
  "beanie",
  "cap",
  "hat",
  "belt",
];

export function garmentKind(name: string): string {
  const n = name.toLowerCase();
  const kind = GARMENTS.find((g) => new RegExp(`\\b${g}s?\\b`).test(n)) ?? "";
  return kind === "trainers" ? "sneakers" : kind === "tee" ? "t-shirt" : kind;
}

/**
 * The closest piece the person already owns. "Exact" means the same kind of garment in the same
 * color (a camel blazer and a camel blazer); the same type in the same color or color family is
 * only "close" (a camel trench for a camel blazer).
 */
export function matchInCloset(piece: Piece, items: Item[]): ClosetMatch {
  const sameKind = items.filter((i) => i.category === piece.category);
  const kind = garmentKind(piece.name);
  const sameColor = sameKind.filter((i) => i.colors[0] === piece.shade);
  const exact = kind ? sameColor.find((i) => garmentKind(i.name) === kind) : undefined;
  if (exact) return { item: exact, exact: true };
  if (sameColor[0]) return { item: sameColor[0], exact: false };
  const fam = family(piece.shade);
  const close = fam === -1 ? undefined : sameKind.find((i) => family(i.colors[0] ?? "") === fam);
  return close ? { item: close, exact: false } : null;
}

export interface Rating {
  score: number;
  headline: string;
  strengths: string[];
  tweaks: string[];
  swapIds: string[];
}

/** A stylist's rating of the outfit in a photo; null when there's no outfit in it. */
export async function rateFit(photo: Photo, items: Item[]): Promise<Rating | null> {
  const answer = parseJson<{
    isOutfit?: boolean;
    score?: number;
    headline?: string;
    strengths?: string[];
    tweaks?: string[];
    swapIds?: string[];
  }>(
    await askAI({
      prompt: [
        "Rate the outfit in this photo as a stylist would: color, proportion, fit and how the pieces work together. Judge the clothes only.",
        items.length
          ? `Their closet (id | name | category | colors | warmth | formality):\n${closetLines(items, 50)}`
          : "",
        'Reply as JSON: {"isOutfit": true, "score": a number from 1 to 10 with one decimal, "headline": "at most 8 words", "strengths": ["two short points"], "tweaks": ["two short, specific changes"], "swapIds": ["ids of up to 2 closet pieces that would improve it"]}',
        'If there is no outfit in the photo, reply {"isOutfit": false}.',
      ]
        .filter(Boolean)
        .join("\n"),
      instructions: STYLIST,
      photo,
      json: true,
    }),
  );
  if (!answer || answer.isOutfit === false || typeof answer.score !== "number") return null;
  return {
    score: Math.min(10, Math.max(1, Math.round(answer.score * 10) / 10)),
    headline: (answer.headline ?? "").slice(0, 60),
    strengths: (answer.strengths ?? []).slice(0, 3).map((s) => s.slice(0, 120)),
    tweaks: (answer.tweaks ?? []).slice(0, 3).map((s) => s.slice(0, 120)),
    swapIds: (answer.swapIds ?? []).filter((id) => items.some((i) => i.id === id)).slice(0, 2),
  };
}

// --- Shopping links ---------------------------------------------------------------------------

export const STORES: { id: string; label: string; url: (q: string) => string }[] = [
  {
    id: "google",
    label: "Google Shopping",
    url: (q) => `https://www.google.com/search?tbm=shop&q=${encodeURIComponent(q)}`,
  },
  {
    id: "amazon",
    label: "Amazon",
    url: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}`,
  },
  {
    id: "ebay",
    label: "Second-hand",
    url: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}`,
  },
];

export function pieceLabel(piece: Piece): string {
  return `${colorLabel(piece.shade)} ${categoryLabel(piece.category).toLowerCase()}`;
}
