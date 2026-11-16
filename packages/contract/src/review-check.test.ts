import { describe, expect, it } from "vitest";
import { withSupportEmail } from "./app-privacy";
import { appInfoFile } from "./app-structure";
import { paymentsConfigFile, supportChatFile, withStoreSettings } from "./platform-config";
import { reviewCheck, type ReviewContext } from "./review-check";

const app = {
  "app/onboarding.tsx": `completeOnboarding();`,
  "app/paywall.tsx": `dismissPaywall; restorePurchases(); o.period; "Renews automatically"; appInfo.termsUrl;`,
  "app/settings.tsx": `restorePurchases(); appInfo.privacyUrl; appInfo.supportEmail;`,
  "app/(tabs)/index.tsx": `haptic("light"); useCollection("habits");`,
  "app/(tabs)/stats.tsx": `useCollection("habits");`,
  "data/app-info.ts": `export const appInfo = {\n  name: "Streaks",\n  version: "1.0.0",\n  supportEmail: "help@example.com",\n  privacyUrl: "https://example.com/privacy",\n  termsUrl: "https://example.com/terms",\n};\n`,
  "app.json": JSON.stringify({ expo: { name: "Streaks", slug: "streaks" } }),
};
const context: ReviewContext = { platform: "ios", openCrashes: 0, openErrors: 0, hasListing: true };
const status = (files: Record<string, string>, ctx: Partial<ReviewContext> = {}) =>
  Object.fromEntries(reviewCheck(files, { ...context, ...ctx }).items.map((i) => [i.id, i.status]));

describe("the App Review check", () => {
  it("flags simulated purchases and a missing bundle ID, and passes the rest", () => {
    const report = reviewCheck(app, context);
    expect(report.ready).toBe(false);
    expect(report.items.filter((i) => i.status === "fail").map((i) => i.id)).toEqual([
      "purchases-real",
      "identifier",
    ]);

    const ready = withStoreSettings(
      {
        ...app,
        "data/payments.ts": paymentsConfigFile({
          iosApiKey: "appl_test",
          androidApiKey: "",
          entitlement: "premium",
        }),
      },
      { ios: "com.example.streaks", android: "com.example.streaks", ascAppId: "" },
    );
    expect(reviewCheck(ready, context).ready).toBe(true);
    // The Android key is still missing.
    expect(status(ready, { platform: "android" })["purchases-real"]).toBe("fail");
  });

  it("knows what App Review rejects, and how the AI can fix it", () => {
    const bare = {
      ...app,
      "app/paywall.tsx": `purchase(id);`,
      "app/(tabs)/index.tsx": `// TODO: the real feature\nuseCollection("habits");`,
      "data/backend.ts": `export const backend = {\n  apiUrl: "https://builder.example",\n  projectId: "p_1",\n};\n`,
      "app/account.tsx": `await signUp(email, password);`,
    };
    const items = reviewCheck(bare, { ...context, openCrashes: 2 }).items;
    const byId = Object.fromEntries(items.map((i) => [i.id, i]));
    for (const id of [
      "paywall-close",
      "restore",
      "renewal-terms",
      "paywall-legal",
      "delete-account",
      "complete",
      "crashes",
    ])
      expect(byId[id]?.status, id).toBe("fail");
    expect(byId["password-reset"]?.status).toBe("warn");
    expect(byId["native"]?.status).toBe("warn");
    expect(byId["delete-account"]?.fix).toContain("deleteAccount()");
    expect(byId["complete"]?.detail).toContain("app/(tabs)/index.tsx");
  });

  it("needs a support email for the support page App Review visits", () => {
    expect(status(app)["support"]).toBe("pass");
    const noEmail = withSupportEmail(app, "");
    expect(noEmail["data/app-info.ts"]).toContain('supportEmail: ""');
    expect(status(noEmail)["support"]).toBe("fail");
    const chatOnly = {
      ...noEmail,
      "data/support-chat.ts": supportChatFile({ appId: "app_abcdefgh1234" }),
    };
    expect(status(chatOnly)["support"]).toBe("warn");
    expect(withSupportEmail(noEmail, "help@water.app")["data/app-info.ts"]).toContain(
      'supportEmail: "help@water.app"',
    );
  });

  it("reads the app-info.ts the platform writes (quoted keys)", () => {
    const written = {
      ...app,
      "data/app-info.ts": appInfoFile({
        name: "Streaks",
        version: "1.0.0",
        supportEmail: "help@example.com",
        privacyUrl: "https://example.com/privacy",
        termsUrl: "https://example.com/terms",
      }),
    };
    expect(written["data/app-info.ts"]).toContain('"privacyUrl": "https://example.com/privacy"');
    expect(status(written)["privacy-policy"]).toBe("pass");
    expect(status(written)["support"]).toBe("pass");
  });

  it("fails a privacy link that can't open on a phone, and warns when sample data reaches real installs", () => {
    const withPrivacy = (url: string) => ({
      ...app,
      "data/app-info.ts": app["data/app-info.ts"].replace("https://example.com/privacy", url),
    });
    expect(status(withPrivacy("http://localhost:3000/apps/p_old/privacy"))["privacy-policy"]).toBe(
      "fail",
    );
    expect(status(withPrivacy("http://example.com/privacy"))["privacy-policy"]).toBe("fail");
    expect(status(app)["privacy-policy"]).toBe("pass");

    // Without a starter list every collection in data/seed.ts reaches a real install: App Review
    // sees streaks and history nobody earned.
    const seed = `export const seed = { habits: [{ id: "h1" }], checkins: [{ id: "c1" }] };`;
    expect(status({ ...app, "data/seed.ts": seed })["first-launch"]).toBe("warn");
    expect(
      status({ ...app, "data/seed.ts": `${seed}\nexport const starter: string[] = ["habits"];` })[
        "first-launch"
      ],
    ).toBe("pass");
  });
});
