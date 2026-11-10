import { describe, expect, it } from "vitest";
import {
  APPLE_STANDARD_EULA_URL,
  legalLinksFor,
  readAppDataPractices,
  withLegalLinks,
} from "./app-privacy";
import { appInfoFile } from "./app-structure";
import { analyticsConfigFile, backendConfigFile, paymentsConfigFile } from "./platform-config";

const info = (privacyUrl = "", termsUrl = "") =>
  appInfoFile({ name: "Kanji Dojo", version: "1.0.0", supportEmail: "", privacyUrl, termsUrl });

describe("hosted app privacy policy", () => {
  it("reads what the app really uses from its files", () => {
    const local = readAppDataPractices({
      "data/app-info.ts": info(),
      "app/(tabs)/index.tsx": "const { place } = useLocation(); useReminder();",
    });
    expect(local).toMatchObject({
      cloud: false,
      accounts: false,
      analytics: false,
      ai: false,
      location: true,
      reminders: true,
      purchases: false,
      appName: "Kanji Dojo",
    });

    const cloud = readAppDataPractices({
      "data/backend.ts": backendConfigFile({
        apiUrl: "https://app.example.com",
        projectId: "p1",
        imageEndpoint: "",
      }),
      "data/analytics-config.ts": analyticsConfigFile({
        url: "https://app.example.com",
        projectId: "p1",
      }),
      "data/payments.ts": paymentsConfigFile({
        iosApiKey: "appl_x",
        androidApiKey: "",
        entitlement: "premium",
      }),
      "app/account.tsx": "auth.signUp(email, password); auth.deleteAccount();",
      "app/ask.tsx": 'import { useAI } from "../data/ai"; <CameraCapture />',
      "app/settings.tsx": "await registerForPush();",
    });
    expect(cloud).toMatchObject({
      cloud: true,
      accounts: true,
      analytics: true,
      ai: true,
      camera: true,
      push: true,
      purchases: true,
    });
  });

  it("fills only empty Privacy and Terms links", () => {
    const links = legalLinksFor("https://app.example.com/", "p1");
    expect(links).toEqual({
      privacyUrl: "https://app.example.com/apps/p1/privacy",
      termsUrl: APPLE_STANDARD_EULA_URL,
    });
    const filled = withLegalLinks({ "data/app-info.ts": info() }, links);
    expect(filled["data/app-info.ts"]).toContain(
      '"privacyUrl": "https://app.example.com/apps/p1/privacy"',
    );
    expect(filled["data/app-info.ts"]).toContain(`"termsUrl": "${APPLE_STANDARD_EULA_URL}"`);

    // The owner's own links stay, and a model-written file in TS style works too.
    const own = { "data/app-info.ts": info("https://mine.example/privacy") };
    const kept = withLegalLinks(own, links)["data/app-info.ts"]!;
    expect(kept).toContain('"privacyUrl": "https://mine.example/privacy"');
    expect(kept).toContain(APPLE_STANDARD_EULA_URL);
    const ts = {
      "data/app-info.ts": `export const appInfo = { name: "X", privacyUrl: '', termsUrl: "" };`,
    };
    expect(withLegalLinks(ts, links)["data/app-info.ts"]).toBe(
      `export const appInfo = { name: "X", privacyUrl: "https://app.example.com/apps/p1/privacy", termsUrl: "${APPLE_STANDARD_EULA_URL}" };`,
    );
    expect(withLegalLinks({}, links)).toEqual({});
  });
});
