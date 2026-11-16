// The closet, the looks it makes, and the rules the app's styling follows.

export type Category = "top" | "bottom" | "dress" | "outerwear" | "shoes" | "accessory";
/** 1 light (tees, linen), 2 medium (knits, denim), 3 warm (coats, wool). */
export type Warmth = 1 | 2 | 3;
/** 1 casual, 2 smart, 3 dressy. */
export type Formality = 1 | 2 | 3;
export type Occasion = "everyday" | "work" | "date" | "weekend" | "active";

export interface Item {
  id: string;
  name: string;
  category: Category;
  /** Color ids from COLORS, main color first. */
  colors: string[];
  warmth: Warmth;
  formality: Formality;
  /** A kept photo (data/photos keepPhoto), or null for a drawn garment. */
  photoUri: string | null;
  favorite: boolean;
  wornCount: number;
  /** YYYY-MM-DD, local. */
  lastWornOn: string | null;
  createdAt: string;
}

/** One piece found in a scanned outfit. */
export interface Piece {
  name: string;
  category: Category;
  /** Color id from COLORS. */
  shade: string;
  details: string;
  /** What to search for in a store, e.g. "women's oversized beige wool blazer". */
  query: string;
}

/**
 * Everything the app made for the person: an outfit from their closet, a scanned look with its
 * pieces, or a rated fit.
 */
export interface Look {
  id: string;
  kind: "outfit" | "shop" | "rate";
  createdAt: string;
  /** YYYY-MM-DD, local. */
  date: string;
  title: string;
  note: string;
  /** Outfit: the closet items. Rated fit: the closet items suggested as swaps. */
  itemIds: string[];
  occasion: Occasion | null;
  weather: { tempC: number; label: string } | null;
  worn: boolean;
  saved: boolean;
  photoUri: string | null;
  pieces: Piece[];
  score: number | null;
  strengths: string[];
  tweaks: string[];
}

export const CATEGORIES: { id: Category; label: string; plural: string }[] = [
  { id: "top", label: "Top", plural: "Tops" },
  { id: "bottom", label: "Bottom", plural: "Bottoms" },
  { id: "dress", label: "Dress", plural: "Dresses" },
  { id: "outerwear", label: "Outerwear", plural: "Outerwear" },
  { id: "shoes", label: "Shoes", plural: "Shoes" },
  { id: "accessory", label: "Accessory", plural: "Accessories" },
];

export const COLORS: { id: string; label: string; neutral: boolean }[] = [
  { id: "black", label: "Black", neutral: true },
  { id: "white", label: "White", neutral: true },
  { id: "cream", label: "Cream", neutral: true },
  { id: "beige", label: "Beige", neutral: true },
  { id: "camel", label: "Camel", neutral: true },
  { id: "brown", label: "Brown", neutral: true },
  { id: "grey", label: "Grey", neutral: true },
  { id: "charcoal", label: "Charcoal", neutral: true },
  { id: "navy", label: "Navy", neutral: true },
  { id: "denim", label: "Denim", neutral: true },
  { id: "blue", label: "Blue", neutral: false },
  { id: "lightblue", label: "Light blue", neutral: false },
  { id: "green", label: "Green", neutral: false },
  { id: "olive", label: "Olive", neutral: false },
  { id: "sage", label: "Sage", neutral: false },
  { id: "red", label: "Red", neutral: false },
  { id: "burgundy", label: "Burgundy", neutral: false },
  { id: "pink", label: "Pink", neutral: false },
  { id: "purple", label: "Purple", neutral: false },
  { id: "lavender", label: "Lavender", neutral: false },
  { id: "yellow", label: "Yellow", neutral: false },
  { id: "orange", label: "Orange", neutral: false },
  { id: "gold", label: "Gold", neutral: false },
  { id: "silver", label: "Silver", neutral: false },
  { id: "print", label: "Print", neutral: false },
];

export const OCCASIONS: { id: Occasion; label: string }[] = [
  { id: "everyday", label: "Everyday" },
  { id: "work", label: "Work" },
  { id: "date", label: "Date night" },
  { id: "weekend", label: "Weekend" },
  { id: "active", label: "Active" },
];

export const WARMTH_LABELS: Record<Warmth, string> = { 1: "Light", 2: "Mid-weight", 3: "Warm" };
export const FORMALITY_LABELS: Record<Formality, string> = { 1: "Casual", 2: "Smart", 3: "Dressy" };

export function categoryLabel(id: Category): string {
  return CATEGORIES.find((c) => c.id === id)?.label ?? "Item";
}

export function colorLabel(id: string): string {
  return COLORS.find((c) => c.id === id)?.label ?? "Print";
}

export function isNeutral(colorId: string): boolean {
  return COLORS.find((c) => c.id === colorId)?.neutral ?? false;
}

/** The closest color id for whatever the AI named ("off-white" -> white), or "print". */
export function toColorId(name: string): string {
  const n = name.toLowerCase().replace(/[^a-z]/g, "");
  const exact = COLORS.find((c) => c.id === n || c.label.toLowerCase().replace(/ /g, "") === n);
  if (exact) return exact.id;
  const near: [RegExp, string][] = [
    [/offwhite|ivory|ecru|bone/, "cream"],
    [/tan|khaki|sand|stone|nude|taupe/, "beige"],
    [/chocolate|coffee|mocha|tobacco/, "brown"],
    [/gray|heather|ash/, "grey"],
    [/graphite|slate/, "charcoal"],
    [/jean|indigo|chambray/, "denim"],
    [/sky|baby|powder/, "lightblue"],
    [/cobalt|royal|teal|turquoise/, "blue"],
    [/khakigreen|army|moss/, "olive"],
    [/mint|eucalyptus/, "sage"],
    [/forest|emerald|kelly/, "green"],
    [/wine|maroon|oxblood|plum/, "burgundy"],
    [/rose|blush|fuchsia|magenta/, "pink"],
    [/lilac|mauve/, "lavender"],
    [/violet/, "purple"],
    [/mustard|lemon/, "yellow"],
    [/rust|coral|peach|terracotta/, "orange"],
    [/scarlet|crimson|cherry/, "red"],
    [/metallic|gold/, "gold"],
    [/grey|silver|chrome/, "silver"],
    [/stripe|check|plaid|floral|pattern|leopard|print/, "print"],
  ];
  return near.find(([pattern]) => pattern.test(n))?.[1] ?? "print";
}

export function toCategory(name: string): Category {
  const n = name.toLowerCase();
  if (/dress|jumpsuit|romper/.test(n)) return "dress";
  if (/coat|jacket|blazer|trench|parka|puffer|gilet|vest|cardigan/.test(n)) return "outerwear";
  if (/shoe|sneaker|trainer|boot|heel|loafer|sandal|flat|mule|pump/.test(n)) return "shoes";
  if (/pant|trouser|jean|short|skirt|legging|chino|bottom/.test(n)) return "bottom";
  if (/bag|belt|hat|cap|scarf|sunglass|jewel|necklace|watch|earring|accessor/.test(n))
    return "accessory";
  return "top";
}

/** YYYY-MM-DD in the phone's time zone. */
export function dayKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function daysBetween(fromKey: string, toKey: string): number {
  const [fy, fm, fd] = fromKey.split("-").map(Number);
  const [ty, tm, td] = toKey.split("-").map(Number);
  const from = Date.UTC(fy!, fm! - 1, fd!);
  const to = Date.UTC(ty!, tm! - 1, td!);
  return Math.round((to - from) / 86_400_000);
}

export function shortDay(key: string): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

/** A blank look of a kind, for the screens to fill in. */
export function newLook(kind: Look["kind"], fields: Partial<Look> = {}): Omit<Look, "id"> {
  return {
    kind,
    createdAt: new Date().toISOString(),
    date: dayKey(),
    title: "",
    note: "",
    itemIds: [],
    occasion: null,
    weather: null,
    worn: false,
    saved: false,
    photoUri: null,
    pieces: [],
    score: null,
    strengths: [],
    tweaks: [],
    ...fields,
  };
}
