import { describe, expect, it } from "vitest";
import { normalizeListing, STORE_LIMITS, type StoreListing } from "./store-listing";

const base: StoreListing = {
  name: "Kanjiwa: Daily JLPT Kanji",
  subtitle: "A small kanji deck, every day",
  promotionalText: "x",
  description: "x",
  keywords: "JLPT,kanji",
  shortDescription: "x",
  category: "Education",
  screenshots: [],
};

describe("store listing limits", () => {
  it("cuts over-long copy at a sentence, or at a word without a dangling connector", () => {
    const listing = normalizeListing(
      {
        ...base,
        shortDescription:
          "One small daily kanji deck for your JLPT level. Flip, quiz, and finish with a win every day.",
        subtitle: "A calm daily kanji habit with a deck",
      },
      [],
    );
    expect(listing.shortDescription).toBe("One small daily kanji deck for your JLPT level.");
    expect(listing.subtitle.length).toBeLessThanOrEqual(STORE_LIMITS.subtitle);
    expect(listing.subtitle).toBe("A calm daily kanji habit");
  });

  it("keeps keywords whole under 100 characters and only real, distinct screens", () => {
    const listing = normalizeListing(
      {
        ...base,
        keywords: Array.from({ length: 30 }, (_, i) => `keyword${i}`).join(","),
        screenshots: [
          { screen: "app/(tabs)/index.tsx", caption: "Your deck for today" },
          { screen: "app/(tabs)/index.tsx", caption: "Again" },
          { screen: "app/nope.tsx", caption: "Not a screen" },
        ],
      },
      ["app/(tabs)/index.tsx"],
    );
    expect(listing.keywords.length).toBeLessThanOrEqual(100);
    expect(listing.keywords.endsWith(",")).toBe(false);
    expect(listing.screenshots).toEqual([
      { screen: "app/(tabs)/index.tsx", caption: "Your deck for today" },
    ]);
  });
});
