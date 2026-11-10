import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { qualityCaps, qualityChecks } from "./quality";
import { RUBRIC, scoreRubric } from "./rubric";

const good = {
  "app/onboarding.tsx": `<Pressable accessibilityRole="button">Skip</Pressable> setAnswer("goal", x); completeOnboarding();`,
  "app/paywall.tsx": `<Pressable accessibilityLabel="Close" onPress={dismissPaywall} /> purchase(id); status; restorePurchases();
    o.period; o.trialDays; "Renews automatically"; appInfo.termsUrl; testMode`,
  "app/settings.tsx": `<Pressable accessibilityRole="button" /> restorePurchases(); "Manage subscription"; appInfo.privacyUrl;
    appInfo.version; appInfo.supportEmail; resetOnboarding();`,
  "app/(tabs)/index.tsx": `const { items, loading } = useCollection("x"); answers.goal; isPremium; openPaywall();
    <Link href="/settings" /> <TextInput placeholder="Coming soon to your list" />`,
};

describe("quality checks", () => {
  it("passes an app whose four parts do their jobs", () => {
    const failed = qualityChecks(good).filter((f) => !f.ok);
    expect(failed).toEqual([]);
  });

  it("caps criteria for missing parts, controls and slop", () => {
    const caps = qualityCaps(
      qualityChecks({
        "app/paywall.tsx": `purchase(id); "Only 3 left!"`,
        "app/(tabs)/index.tsx": `import { TouchableOpacity, Modal } from "react-native";
          Alert.alert("Saved"); <Modal /> <Text>🔥 Lorem ipsum</Text> useCollection("x");`,
      }),
    );
    expect(caps).toMatchObject({ O1: 0, O2: 0, O3: 0, S1: 0, S2: 0, S3: 0 });
    expect(caps.P3).toBe(0); // no close button
    expect(caps.P4).toBe(1); // fake scarcity
    expect(caps.M2).toBe(1); // placeholder copy
    expect(caps.M3).toBe(2); // Alert pop-up
    expect(caps.C5).toBe(0); // TouchableOpacity, Modal, Alert, emoji
  });

  it("scores out of 100 and applies caps and the render-failure ceiling", () => {
    expect(RUBRIC.reduce((sum, c) => sum + c.weight, 0)).toBe(100);
    const all3 = Object.fromEntries(RUBRIC.map((c) => [c.id, { score: 3, evidence: "", fix: "" }]));
    expect(scoreRubric(all3, {}).total).toBe(100);
    const capped = scoreRubric(all3, { P3: 0 });
    expect(capped.parts.paywall).toEqual({ points: 16, max: 20 });
    expect(capped.criteria.find((c) => c.id === "P3")).toMatchObject({ judged: 3, score: 0 });
    expect(scoreRubric(all3, {}, { renderFailure: true })).toMatchObject({ total: 40 });
  });
});

describe("rubric document", () => {
  it("lists every criterion with its title and points", () => {
    const doc = readFileSync(
      new URL("../../../docs/08-app-quality-rubric.md", import.meta.url),
      "utf8",
    );
    for (const c of RUBRIC) {
      const row = new RegExp(`\\|\\s*${c.id}\\s*\\|\\s*${c.title}\\s*\\|\\s*${c.weight}\\s*\\|`);
      expect(doc, `${c.id} ${c.title}`).toMatch(row);
    }
  });
});
