import { describe, expect, it } from "vitest";
import {
  appIdentifier,
  DEFAULT_PAYMENTS,
  paymentsConfigFile,
  readAppIdentifiers,
  readPaymentsConfig,
  refreshTemplate,
  withAppIdentifiers,
} from "./platform-config";

const template = {
  "package.json": JSON.stringify({
    name: "generated-app",
    dependencies: {
      expo: "~58.0.23",
      "expo-camera": "~58.0.14",
      "react-native-purchases": "10.15.1",
    },
  }),
  "app.json": JSON.stringify({
    expo: { name: "Generated App", plugins: ["expo-router", "expo-camera"] },
  }),
};

describe("platform files", () => {
  it("older apps get the template's new dependencies and plugins, keeping their own name", () => {
    const old = {
      "package.json": JSON.stringify({
        name: "generated-app",
        dependencies: { expo: "~58.0.20", "left-pad": "1.0.0" },
      }),
      "app.json": JSON.stringify({
        expo: { name: "Kanjiwa", slug: "kanjiwa", plugins: ["expo-router"] },
      }),
    };
    const next = refreshTemplate(old, template);
    const pkg = JSON.parse(next["package.json"]!) as { dependencies: Record<string, string> };
    expect(pkg.dependencies).toEqual({
      expo: "~58.0.23",
      "expo-camera": "~58.0.14",
      "left-pad": "1.0.0",
      "react-native-purchases": "10.15.1",
    });
    const app = JSON.parse(next["app.json"]!) as { expo: { name: string; plugins: unknown } };
    expect(app.expo.name).toBe("Kanjiwa");
    expect(app.expo.plugins).toEqual(["expo-router", "expo-camera"]);
    // Refreshing again changes nothing.
    expect(refreshTemplate(next, template)["package.json"]).toBe(next["package.json"]);
  });

  it("gives an app store identifiers valid for both stores, and keeps them once set", () => {
    expect(appIdentifier("Kanji-Wa!", "p_bithjb2vm2wnif")).toBe("com.appbuilder.kanjiwawnif");
    expect(appIdentifier("123", "p_x")).toBe("com.appbuilder.apppx");
    const files = { "app.json": JSON.stringify({ expo: { slug: "kanjiwa" } }) };
    const once = withAppIdentifiers(files, "p_abcd1234");
    expect(readAppIdentifiers(once)).toEqual({
      ios: "com.appbuilder.kanjiwa1234",
      android: "com.appbuilder.kanjiwa1234",
    });
    const custom = {
      "app.json": JSON.stringify({
        expo: {
          slug: "x",
          ios: { bundleIdentifier: "com.me.x" },
          android: { package: "com.me.x" },
        },
      }),
    };
    expect(withAppIdentifiers(custom, "p_abcd1234")).toBe(custom);
  });

  it("writes and reads the payments file", () => {
    const keys = { iosApiKey: "appl_abcdefghijk", androidApiKey: "", entitlement: "pro" };
    expect(readPaymentsConfig({ "data/payments.ts": paymentsConfigFile(keys) })).toEqual(keys);
    expect(readPaymentsConfig({})).toEqual(DEFAULT_PAYMENTS);
  });
});
