import { dayKey, type Item, type Look } from "./schema";

function daysAgo(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return dayKey(date);
}

const created = new Date(Date.now() - 20 * 86_400_000).toISOString();

function item(
  fields: Omit<Item, "favorite" | "wornCount" | "lastWornOn" | "createdAt" | "photoUri"> &
    Partial<Item>,
): Item {
  return {
    favorite: false,
    wornCount: 0,
    lastWornOn: null,
    createdAt: created,
    photoUri: null,
    ...fields,
  };
}

// A small capsule closet: enough for a week of outfits, within the free plan's 15 items.
const items: Item[] = [
  item({
    id: "i1",
    name: "White cotton tee",
    category: "top",
    colors: ["white"],
    warmth: 1,
    formality: 1,
    wornCount: 9,
    lastWornOn: daysAgo(3),
  }),
  item({
    id: "i2",
    name: "Navy merino crewneck",
    category: "top",
    colors: ["navy"],
    warmth: 2,
    formality: 2,
    wornCount: 4,
    favorite: true,
  }),
  item({
    id: "i3",
    name: "Light blue oxford shirt",
    category: "top",
    colors: ["lightblue"],
    warmth: 1,
    formality: 2,
    wornCount: 5,
    lastWornOn: daysAgo(1),
  }),
  item({
    id: "i4",
    name: "Cream cable knit",
    category: "top",
    colors: ["cream"],
    warmth: 3,
    formality: 1,
    wornCount: 2,
  }),
  item({
    id: "i5",
    name: "Straight-leg jeans",
    category: "bottom",
    colors: ["denim"],
    warmth: 2,
    formality: 1,
    wornCount: 12,
    lastWornOn: daysAgo(1),
  }),
  item({
    id: "i6",
    name: "Charcoal wool trousers",
    category: "bottom",
    colors: ["charcoal"],
    warmth: 2,
    formality: 3,
    wornCount: 3,
  }),
  item({
    id: "i7",
    name: "Olive chinos",
    category: "bottom",
    colors: ["olive"],
    warmth: 2,
    formality: 2,
    wornCount: 2,
  }),
  item({
    id: "i8",
    name: "Camel trench coat",
    category: "outerwear",
    colors: ["camel"],
    warmth: 2,
    formality: 2,
    wornCount: 6,
    favorite: true,
  }),
  item({
    id: "i9",
    name: "Black puffer jacket",
    category: "outerwear",
    colors: ["black"],
    warmth: 3,
    formality: 1,
    wornCount: 1,
  }),
  item({
    id: "i10",
    name: "White leather sneakers",
    category: "shoes",
    colors: ["white"],
    warmth: 2,
    formality: 1,
    wornCount: 14,
    lastWornOn: daysAgo(1),
  }),
  item({
    id: "i11",
    name: "Brown suede loafers",
    category: "shoes",
    colors: ["brown"],
    warmth: 2,
    formality: 2,
    wornCount: 4,
  }),
  item({
    id: "i12",
    name: "Burgundy wool scarf",
    category: "accessory",
    colors: ["burgundy"],
    warmth: 3,
    formality: 2,
    wornCount: 1,
  }),
];

const looks: Look[] = [
  {
    id: "l1",
    kind: "outfit",
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    date: daysAgo(1),
    title: "Crisp blue on denim",
    note: "The oxford keeps jeans sharp enough for the office; white sneakers keep it easy.",
    itemIds: ["i3", "i5", "i10"],
    occasion: "work",
    weather: { tempC: 17, label: "Partly cloudy" },
    worn: true,
    saved: true,
    photoUri: null,
    pieces: [],
    score: null,
    strengths: [],
    tweaks: [],
  },
  {
    id: "l2",
    kind: "shop",
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    date: daysAgo(2),
    title: "Quiet tailoring in camel",
    note: "",
    itemIds: [],
    occasion: null,
    weather: null,
    worn: false,
    saved: true,
    photoUri: null,
    pieces: [
      {
        name: "Double-breasted wool blazer",
        category: "outerwear",
        shade: "camel",
        details: "Relaxed shoulders, peak lapels, hits at the hip.",
        query: "camel double breasted wool blazer relaxed fit",
      },
      {
        name: "Fine-knit turtleneck",
        category: "top",
        shade: "cream",
        details: "Slim, ribbed neck, merino or similar fine wool.",
        query: "cream fine knit merino turtleneck",
      },
      {
        name: "Wide-leg pleated trousers",
        category: "bottom",
        shade: "charcoal",
        details: "High rise, single pleat, full length with a soft break.",
        query: "charcoal wide leg pleated trousers high rise",
      },
      {
        name: "Leather penny loafers",
        category: "shoes",
        shade: "brown",
        details: "Polished leather, low stacked heel.",
        query: "brown leather penny loafers",
      },
    ],
    score: null,
    strengths: [],
    tweaks: [],
  },
];

export const seed: { items: Item[]; looks: Look[] } = { items, looks };

/** Every install starts empty: the closet and looks above are examples for trying the app. */
export const starter: string[] = [];
