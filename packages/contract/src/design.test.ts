import { describe, expect, it } from "vitest";
import { normalizePlan, type AppPlan } from "./app-plan";
import { keyScreenPath, normalizeDirection, normalizeResearch, poseImageName } from "./design";

const plan = normalizePlan(
  {
    appName: "Sippo",
    summary: "Drink more water",
    audience: "",
    angle: "",
    coreLoop: "",
    shareMoment: "",
    onboarding: { steps: [] },
    monetization: { premiumFeatures: [], offers: [] },
    screens: [
      {
        key: "index",
        title: "Today",
        kind: "tab",
        path: "app/(tabs)/index.tsx",
        purpose: "Log water",
        icon: "water",
        role: "main",
      },
      {
        key: "history",
        title: "History",
        kind: "tab",
        path: "app/(tabs)/history.tsx",
        purpose: "Past days",
        icon: "calendar",
        role: "main",
      },
    ],
    collections: [],
    themes: [{ id: "lagoon", name: "Lagoon", dark: false, mood: "Fresh", primary: "#1FB5C9" }],
  } as unknown as AppPlan,
  { maxScreens: 5 },
).plan;

describe("design direction", () => {
  it("gives every plan screen exactly one brief, in the plan's order", () => {
    const d = normalizeDirection(
      {
        styleName: "Morning Meniscus",
        palette: { primary: "not a color", background: "#FFFFFF" },
        screens: [
          { path: "app/(tabs)/history.tsx", title: "History", mockupBrief: "A calendar" },
          { path: "app/unknown.tsx", title: "Ghost", mockupBrief: "Not in the plan" },
        ],
        mascot: {
          use: true,
          name: "Sippo",
          look: "A droplet",
          personality: "Kind",
          poses: [{ name: "neutral", description: "Standing" }],
        },
      },
      plan,
    );
    expect(d.screens.map((s) => s.path)).toEqual(plan.screens.map((s) => s.path));
    expect(d.screens.find((s) => s.path === "app/(tabs)/history.tsx")!.mockupBrief).toBe(
      "A calendar",
    );
    // A screen the designer skipped falls back to its purpose from the plan.
    expect(d.screens.find((s) => s.path === "app/(tabs)/index.tsx")!.mockupBrief).toBe("Log water");
    // Bad colors fall back to the plan's primary; one pose isn't enough for a mascot.
    expect(d.palette.primary).toBe("#1FB5C9");
    expect(d.mascot).toBeNull();
  });

  it("keeps a mascot only when asked for, with 2 to 4 distinct poses", () => {
    const poses = ["neutral", "happy", "sleepy", "proud", "neutral", "extra"].map((name) => ({
      name,
      description: `${name} pose`,
    }));
    const d = normalizeDirection(
      { mascot: { use: true, name: "Sippo", look: "A round droplet", personality: "Kind", poses } },
      plan,
    );
    expect(d.mascot?.poses.map((p) => p.name)).toEqual(["neutral", "happy", "sleepy", "proud"]);
    expect(
      normalizeDirection(
        { mascot: { use: false, name: "X", look: "Y", personality: "", poses } },
        plan,
      ).mascot,
    ).toBeNull();
  });

  it("names pose images so code can use them, and picks the main tab as the key screen", () => {
    expect(poseImageName("Sippo", "Half Full")).toBe("sippo-half-full");
    expect(poseImageName("4Leaf", "happy")).toBe("m-4leaf-happy");
    expect(keyScreenPath(plan)).toBe("app/(tabs)/index.tsx");
  });

  it("accepts partial research and rejects empty answers", () => {
    expect(normalizeResearch({})).toBeNull();
    const r = normalizeResearch({
      brief: "Lead with leftovers.",
      competitors: [{ name: "Meal Matcher", complaints: ["Ads"] }],
    });
    expect(r?.competitors[0]).toEqual({
      name: "Meal Matcher",
      whatPeopleLove: [],
      complaints: ["Ads"],
    });
  });
});
