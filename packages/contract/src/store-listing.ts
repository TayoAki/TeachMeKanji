/**
 * The App Store and Google Play listing for an app: the text the stores show, and a caption for
 * each screenshot. Written by the store_listing run, framed into screenshots by the builder.
 */
export interface StoreListing {
  /** App Store name, at most 30 characters. */
  name: string;
  /** App Store subtitle, at most 30 characters. */
  subtitle: string;
  /** App Store promotional text, at most 170 characters. */
  promotionalText: string;
  /** Both stores' long description, at most 4000 characters. */
  description: string;
  /** App Store keywords, comma-separated, at most 100 characters. */
  keywords: string;
  /** Google Play short description, at most 80 characters. */
  shortDescription: string;
  /** The App Store category that fits best, e.g. "Education". */
  category: string;
  /** One screenshot per main screen, in the order to show them. */
  screenshots: Array<{ screen: string; caption: string }>;
}

export const STORE_LIMITS = {
  name: 30,
  subtitle: 30,
  promotionalText: 170,
  description: 4000,
  keywords: 100,
  shortDescription: 80,
  caption: 40,
  screenshots: 6,
} as const;

export const STORE_LISTING_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "name",
    "subtitle",
    "promotionalText",
    "description",
    "keywords",
    "shortDescription",
    "category",
    "screenshots",
  ],
  properties: {
    name: { type: "string" },
    subtitle: { type: "string" },
    promotionalText: { type: "string" },
    description: { type: "string" },
    keywords: { type: "string" },
    shortDescription: { type: "string" },
    category: { type: "string" },
    screenshots: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["screen", "caption"],
        properties: { screen: { type: "string" }, caption: { type: "string" } },
      },
    },
  },
} as const;

/** Trim every field to the store's limit (at a word boundary where possible). */
export function normalizeListing(raw: StoreListing, screens: string[]): StoreListing {
  const cut = (text: unknown, max: number) => {
    const value = String(text ?? "").trim();
    if (value.length <= max) return value;
    const clipped = value.slice(0, max);
    // A whole sentence if one fits in most of the space…
    const sentence = Math.max(
      ...[". ", "! ", "? "].map((end) => clipped.lastIndexOf(end) + 1),
      /[.!?]$/.test(clipped) ? clipped.length : 0,
    );
    if (sentence > max * 0.5) return clipped.slice(0, sentence).trim();
    // …else whole words, without a dangling "with a" or comma at the end.
    const space = clipped.lastIndexOf(" ");
    let words = (space > max * 0.6 ? clipped.slice(0, space) : clipped).trim();
    while (/[\s,;:—–-]+(a|an|the|and|or|with|to|of|for|in|on|at|by|your|from)$/i.test(words))
      words = words.replace(/[\s,;:—–-]+\S+$/, "");
    return words.replace(/[,;:—–-]+$/, "").trim();
  };
  const keywords = String(raw.keywords ?? "")
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
  let joined = "";
  for (const keyword of keywords) {
    const next = joined ? `${joined},${keyword}` : keyword;
    if (next.length > STORE_LIMITS.keywords) break;
    joined = next;
  }
  const seen = new Set<string>();
  const screenshots = (raw.screenshots ?? [])
    .filter((s) => screens.includes(s.screen) && !seen.has(s.screen) && seen.add(s.screen))
    .slice(0, STORE_LIMITS.screenshots)
    .map((s) => ({ screen: s.screen, caption: cut(s.caption, STORE_LIMITS.caption) }));
  return {
    name: cut(raw.name, STORE_LIMITS.name),
    subtitle: cut(raw.subtitle, STORE_LIMITS.subtitle),
    promotionalText: cut(raw.promotionalText, STORE_LIMITS.promotionalText),
    description: cut(raw.description, STORE_LIMITS.description),
    keywords: joined,
    shortDescription: cut(raw.shortDescription, STORE_LIMITS.shortDescription),
    category: cut(raw.category, 40),
    screenshots,
  };
}
