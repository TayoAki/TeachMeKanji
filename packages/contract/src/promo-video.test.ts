import { describe, expect, it } from "vitest";
import {
  normalizePromoColors,
  normalizeStoryboard,
  PROMO_DEFAULT_CTA,
  PROMO_LIMITS,
  promoProblems,
  promoScreens,
  promoTimeline,
} from "./promo-video";

const SCREENS = ["app/(tabs)/index.tsx", "app/(tabs)/review.tsx", "app/(tabs)/progress.tsx"];

describe("promo storyboards", () => {
  it("keeps known screens once, trims every line to its limit and never invents a CTA", () => {
    const board = normalizeStoryboard(
      {
        hook: "Learn ten new kanji every single morning before work, calmly",
        beats: [
          { screen: "app/(tabs)/index.tsx", caption: "A lesson a day", focus: "top" },
          { screen: "app/(tabs)/index.tsx", caption: "duplicate", focus: "top" },
          { screen: "app/paywall.tsx", caption: "not offered", focus: "middle" },
          {
            screen: "app/(tabs)/progress.tsx",
            caption: "Watch your streak grow every day, week after week, all year",
            focus: "sideways",
          },
        ],
        tagline: "Kanji, one calm minute at a time",
        cta: "",
      },
      SCREENS,
    );
    expect(board.beats.map((b) => b.screen)).toEqual([
      "app/(tabs)/index.tsx",
      "app/(tabs)/progress.tsx",
    ]);
    expect(board.hook.length).toBeLessThanOrEqual(PROMO_LIMITS.hook);
    expect(board.hook).toBe("Learn ten new kanji every single");
    expect(board.beats[1]!.caption.length).toBeLessThanOrEqual(PROMO_LIMITS.caption);
    expect(board.beats[1]!.focus).toBe("middle");
    expect(board.cta).toBe(PROMO_DEFAULT_CTA);
    expect(promoProblems(board)).toEqual([]);
    expect(normalizeStoryboard("garbage", SCREENS)).toMatchObject({ hook: "", beats: [] });
  });

  it("says what still stops a board from being filmed", () => {
    const board = normalizeStoryboard(
      { hook: "", beats: [{ screen: SCREENS[0], caption: "" }] },
      SCREENS,
    );
    expect(promoProblems(board)).toEqual([
      "Write the hook: the words on screen from the first frame.",
      `Pick at least ${PROMO_LIMITS.minBeats} screens.`,
      "Write a caption for screen 1.",
    ]);
  });

  it("times the film from its words: beats back to back, the payoff longer, then marquee and close", () => {
    const board = normalizeStoryboard(
      {
        hook: "Read Japanese in 10 minutes a day",
        beats: SCREENS.map((screen) => ({ screen, caption: "Short and clear", focus: "top" })),
        tagline: "Kanji, one calm minute at a time",
        cta: "Coming soon to iPhone",
      },
      SCREENS,
    );
    const t = promoTimeline(board);
    expect(t.beats[0]!.start).toBe(0);
    t.beats.slice(1).forEach((beat, i) => expect(beat.start).toBe(t.beats[i]!.end));
    const lengths = t.beats.map((b) => b.end - b.start);
    expect(lengths[2]!).toBeGreaterThan(lengths[1]!);
    expect(t.marquee.start).toBe(t.beats[2]!.end);
    expect(t.close.start).toBe(t.marquee.end);
    expect(t.duration).toBe(t.close.end);
    expect(t.duration).toBeGreaterThan(14);
    expect(t.duration).toBeLessThan(25);
  });

  it("leaves the paywall and settings out, and only accepts real colors", () => {
    expect(
      promoScreens([
        "app/_layout.tsx",
        "app/(tabs)/_layout.tsx",
        "app/(tabs)/index.tsx",
        "app/paywall.tsx",
        "app/settings.tsx",
        "app/onboarding.tsx",
        "components/Card.tsx",
      ]).sort(),
    ).toEqual(["app/(tabs)/index.tsx", "app/onboarding.tsx"]);
    const colors = normalizePromoColors({
      primary: "#E5484D",
      text: "rgb(250, 250, 250)",
      background: "url(javascript:alert(1))",
    });
    expect(colors.primary).toBe("#E5484D");
    expect(colors.text).toBe("rgb(250, 250, 250)");
    expect(colors.background).toBe("#0b0b0f");
  });
});
