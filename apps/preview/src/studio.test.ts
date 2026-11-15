// The apps built by hand in studio/ (Closetcast): they must keep passing the factory's contract,
// and their styling logic must hold.
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { validateProject, withAppStructure } from "@appbuilder/contract";
import { loadProject } from "@appbuilder/contract/node";
import { createModuleSystem } from "./loader";
import { vendorModules } from "./vendor";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const files = withAppStructure(
  await loadProject(join(root, "templates/expo-app"), join(root, "studio/stylist")),
);
const modules = createModuleSystem(files, vendorModules, { instrument: false });

interface Item {
  id: string;
  name: string;
  category: string;
  colors: string[];
  warmth: 1 | 2 | 3;
  formality: 1 | 2 | 3;
  photoUri: string | null;
  favorite: boolean;
  wornCount: number;
  lastWornOn: string | null;
  createdAt: string;
}
interface Day {
  tempC: number;
  rainChance: number;
  occasion: string;
  recentIds: Set<string>;
  styles: string[];
  wear: string;
  seed: number;
}

const stylist = modules.require("components/stylist.ts") as {
  pickOutfit: (items: Item[], day: Day) => Item[];
  isWearable: (items: Item[]) => boolean;
  describeOutfit: (items: Item[], day: Day) => { title: string; why: string };
  matchInCloset: (
    piece: { name: string; category: string; shade: string; details: string; query: string },
    items: Item[],
  ) => { item: Item; exact: boolean } | null;
  garmentKind: (name: string) => string;
  parseJson: <T>(text: string) => T | null;
};
const schema = modules.require("data/schema.ts") as { toColorId: (name: string) => string };
const { seed } = modules.require("data/seed.ts") as { seed: { items: Item[] } };

const day = (fields: Partial<Day>): Day => ({
  tempC: 18,
  rainChance: 0,
  occasion: "everyday",
  recentIds: new Set(),
  styles: [],
  wear: "",
  seed: 1,
  ...fields,
});

describe("Closetcast (studio/stylist)", () => {
  it("passes the factory's contract", () => {
    const errors = validateProject(files).filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
  });

  it("always makes a wearable outfit from the sample closet, with shoes, for any weather and occasion", () => {
    for (const tempC of [-4, 6, 14, 21, 30])
      for (const occasion of ["everyday", "work", "date", "weekend", "active"])
        for (const s of [1, 2, 3]) {
          const outfit = stylist.pickOutfit(seed.items, day({ tempC, occasion, seed: s }));
          expect(stylist.isWearable(outfit)).toBe(true);
          expect(outfit.some((i) => i.category === "shoes")).toBe(true);
          expect(new Set(outfit.map((i) => i.id)).size).toBe(outfit.length);
        }
  });

  it("adds a layer when it's cold or rain is likely, and none on a hot day", () => {
    const layered = (d: Day) =>
      stylist.pickOutfit(seed.items, d).some((i) => i.category === "outerwear");
    expect(layered(day({ tempC: 3 }))).toBe(true);
    expect(layered(day({ tempC: 19, rainChance: 70 }))).toBe(true);
    expect(layered(day({ tempC: 29 }))).toBe(false);
    const cold = stylist.pickOutfit(seed.items, day({ tempC: 2 }));
    expect(stylist.describeOutfit(cold, day({ tempC: 2 })).why).toMatch(/cold/);
  });

  it("avoids what was just worn when there's another choice", () => {
    const first = stylist.pickOutfit(seed.items, day({ seed: 4 }));
    const top = first.find((i) => i.category === "top")!;
    for (const s of [5, 6, 7]) {
      const next = stylist.pickOutfit(seed.items, day({ seed: s, recentIds: new Set([top.id]) }));
      expect(next.some((i) => i.id === top.id)).toBe(false);
    }
  });

  it("calls a closet piece yours only when it's the same garment in the same color", () => {
    const piece = (name: string, category: string, shade: string) => ({
      name,
      category,
      shade,
      details: "",
      query: name,
    });
    // A camel blazer isn't the camel trench they own: that's close, not exact.
    expect(
      stylist.matchInCloset(piece("Double-breasted wool blazer", "outerwear", "camel"), seed.items),
    ).toMatchObject({
      item: { name: "Camel trench coat" },
      exact: false,
    });
    expect(
      stylist.matchInCloset(piece("Belted trench coat", "outerwear", "camel"), seed.items)?.exact,
    ).toBe(true);
    // Same color family counts as close; nothing of the kind is no match.
    expect(
      stylist.matchInCloset(piece("Ivory silk shirt", "top", "cream"), seed.items)?.exact,
    ).toBe(false);
    expect(stylist.matchInCloset(piece("Red ballet flats", "shoes", "red"), seed.items)).toBeNull();
    expect(stylist.garmentKind("White leather sneakers")).toBe("sneakers");
    expect(stylist.garmentKind("Oversized graphic tee")).toBe("t-shirt");
  });

  it("maps the colors the AI names onto the app's colors, and reads JSON wrapped in prose", () => {
    expect(
      ["Off-white", "Tan", "Indigo", "Wine", "Mustard", "Leopard print", "Neon"].map(
        schema.toColorId,
      ),
    ).toEqual(["cream", "beige", "denim", "burgundy", "yellow", "print", "print"]);
    expect(stylist.parseJson<{ a: number }>('Sure! {"a": 1} Hope that helps')).toEqual({ a: 1 });
    expect(stylist.parseJson("no json here")).toBeNull();
  });
});
