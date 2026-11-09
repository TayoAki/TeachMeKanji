import { describe, expect, it } from "vitest";
import { normalizePlan, type AppPlan } from "./app-plan";
import {
  APP_INFO_FILE,
  APP_STRUCTURE_FILE,
  countLimitedScreens,
  MONETIZATION_FILE,
  withAppStructure,
} from "./app-structure";
import { refreshTemplate } from "./platform-config";
import { validateStructureScreens } from "./validate";

const theme = { id: "a", name: "A", mood: "calm", dark: false, primary: "#336699" };

/** A plan saved before the four-part structure existed (no roles, no product fields). */
const oldPlan = {
  appName: "Kanji",
  summary: "Learn kanji.",
  screens: [
    {
      key: "home",
      title: "Today",
      kind: "tab",
      path: "app/(tabs)/index.tsx",
      purpose: "Cards",
      icon: "home",
    },
    {
      key: "quiz",
      title: "Quiz",
      kind: "tab",
      path: "app/(tabs)/quiz.tsx",
      purpose: "Quiz",
      icon: "help",
    },
  ],
  collections: [],
  themes: [theme],
} as unknown as AppPlan;

describe("four-part app structure", () => {
  it("gives older plans onboarding, a paywall and settings, in journey order", () => {
    const { plan, fixes } = normalizePlan(oldPlan, { maxScreens: 5 });
    expect(plan.screens.map((s) => [s.role, s.path])).toEqual([
      ["onboarding", "app/onboarding.tsx"],
      ["paywall", "app/paywall.tsx"],
      ["main", "app/(tabs)/index.tsx"],
      ["main", "app/(tabs)/quiz.tsx"],
      ["settings", "app/settings.tsx"],
    ]);
    expect(plan.monetization.offers.length).toBeGreaterThan(0);
    expect(plan.onboarding.steps.length).toBeGreaterThan(0);
    expect(fixes).toContain("added the paywall screen");
  });

  it("keeps one screen per structure role at its fixed route and doesn't count them", () => {
    const { plan, fixes } = normalizePlan(
      {
        ...oldPlan,
        screens: [
          {
            key: "intro",
            title: "Hi",
            kind: "tab",
            path: "app/(tabs)/intro.tsx",
            purpose: "",
            icon: "",
            role: "onboarding",
          },
          {
            key: "intro2",
            title: "Again",
            kind: "stack",
            path: "app/x.tsx",
            purpose: "",
            icon: "",
            role: "onboarding",
          },
          // A main screen that claims a structure route becomes that structure screen.
          {
            key: "prefs",
            title: "Prefs",
            kind: "tab",
            path: "app/settings.tsx",
            purpose: "",
            icon: "",
            role: "main",
          },
          ...oldPlan.screens.map((s) => ({ ...s, role: "main" as const })),
        ],
      },
      { maxScreens: 1 },
    );
    expect(plan.screens.find((s) => s.role === "onboarding")).toMatchObject({
      path: "app/onboarding.tsx",
      kind: "stack",
      title: "Hi",
    });
    expect(plan.screens.find((s) => s.role === "settings")!.title).toBe("Prefs");
    expect(fixes.some((f) => f.includes("second onboarding"))).toBe(true);
    // maxScreens limits the main screens only.
    expect(plan.screens.filter((s) => s.role === "main")).toHaveLength(1);
    expect(plan.screens).toHaveLength(4);
  });

  it("tracks which structure screens exist and seeds editable platform files", () => {
    const files = withAppStructure({ "app/onboarding.tsx": "x", "app/settings.tsx": "y" });
    expect(files[APP_STRUCTURE_FILE]).toContain("onboarding: true");
    expect(files[APP_STRUCTURE_FILE]).toContain("paywall: false");
    expect(countLimitedScreens({ ...files, "app/(tabs)/index.tsx": "z" })).toBe(1);

    const template = {
      [MONETIZATION_FILE]: "default monetization",
      [APP_INFO_FILE]: "default info",
    };
    const refreshed = refreshTemplate(
      { "app/paywall.tsx": "p", [MONETIZATION_FILE]: "mine" },
      template,
    );
    expect(refreshed[MONETIZATION_FILE]).toBe("mine");
    expect(refreshed[APP_INFO_FILE]).toBe("default info");
    expect(refreshed[APP_STRUCTURE_FILE]).toContain("paywall: true");
  });

  it("requires a paywall that can buy, restore and close", () => {
    const rules = (files: Record<string, string>) =>
      validateStructureScreens(files)
        .filter((i) => i.severity === "error")
        .map((i) => i.rule);
    expect(rules({ "app/paywall.tsx": "export default function P() { return null; }" })).toEqual([
      "structure/paywall-purchase",
      "structure/paywall-restore",
      "structure/paywall-close",
    ]);
    expect(
      rules({
        "app/paywall.tsx": "purchase(id); restorePurchases(); dismissPaywall(); appInfo.termsUrl",
        "app/onboarding.tsx": "completeOnboarding()",
      }),
    ).toEqual([]);
    expect(rules({ "app/onboarding.tsx": "setStep(1)" })).toEqual([
      "structure/onboarding-complete",
    ]);
  });
});
