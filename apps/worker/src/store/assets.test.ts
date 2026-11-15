import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { STORE_SHOT_SIZE, withStoreBuild, type AppPlan } from "@appbuilder/contract";
import { fixtureProject } from "../project";
import { canRenderScreens, closeRenderer } from "../render/screens";
import { adaptiveForeground, drawIcon, frameShots, primaryOf } from "./assets";

afterAll(() => closeRenderer());

const plan = {
  appName: "Streaks",
  summary: "Keep a habit going.",
  angle: "",
  themes: [{ id: "ocean", name: "Ocean", mood: "calm", dark: false, primary: "#1E6FD9" }],
} as unknown as AppPlan;

describe("App Store assets", () => {
  it("draws a 1024 px icon without transparency, and an adaptive icon foreground", async () => {
    const before = process.env.IMAGE_PROVIDER;
    process.env.IMAGE_PROVIDER = "fake";
    let charged = -1;
    try {
      const icon = await drawIcon(plan, primaryOf(plan, "ocean"), (usd) => (charged = usd));
      const meta = await sharp(icon!).metadata();
      expect([meta.width, meta.height, meta.hasAlpha]).toEqual([1024, 1024, false]);
      expect(charged).toBe(0);
      const fg = await sharp(await adaptiveForeground(icon!, "#1E6FD9")).metadata();
      expect([fg.width, fg.height]).toEqual([1024, 1024]);
    } finally {
      if (before === undefined) delete process.env.IMAGE_PROVIDER;
      else process.env.IMAGE_PROVIDER = before;
    }
  });

  it(
    "frames real screens at the 6.9-inch size with the caption, without transparency",
    { timeout: 120_000 },
    async ({ skip }) => {
      if (!(await canRenderScreens())) skip();
      const files = await fixtureProject("habit-tracker");
      const shots = await frameShots(
        files,
        [
          { screen: "app/(tabs)/index.tsx", caption: "Keep every habit in one place" },
          { screen: "app/no-such-screen.tsx", caption: "Left out" },
        ],
        { primary: "#1E6FD9" },
      );
      expect(shots.map((s) => s.screen)).toEqual(["app/(tabs)/index.tsx"]);
      const meta = await sharp(shots[0]!.png).metadata();
      expect([meta.width, meta.height, meta.hasAlpha]).toEqual([
        STORE_SHOT_SIZE.width,
        STORE_SHOT_SIZE.height,
        false,
      ]);
      // The top band is the app's color behind the caption.
      const { data } = await sharp(shots[0]!.png)
        .extract({ left: 10, top: 10, width: 1, height: 1 })
        .raw()
        .toBuffer({ resolveWithObject: true });
      expect(data[2]).toBeGreaterThan(data[0]!);
    },
  );

  it("configures a store build: icon, adaptive icon, splash and export compliance", () => {
    const files = {
      "app.json": JSON.stringify({ expo: { name: "Streaks", plugins: ["expo-router"] } }),
    };
    const withIcon = JSON.parse(
      withStoreBuild(files, { icon: true, background: "#1E6FD9" })["app.json"]!,
    );
    expect(withIcon.expo.icon).toBe("./assets/store-icon.png");
    expect(withIcon.expo.android.adaptiveIcon).toEqual({
      foregroundImage: "./assets/store-adaptive-icon.png",
      backgroundColor: "#1E6FD9",
    });
    expect(withIcon.expo.plugins).toEqual([
      "expo-router",
      [
        "expo-splash-screen",
        {
          image: "./assets/store-splash.png",
          imageWidth: 200,
          resizeMode: "contain",
          backgroundColor: "#1E6FD9",
        },
      ],
    ]);
    expect(withIcon.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
    // Without an icon only the export compliance answer is added.
    const plain = JSON.parse(
      withStoreBuild(files, { icon: false, background: "#000000" })["app.json"]!,
    );
    expect(plain.expo.icon).toBeUndefined();
    expect(plain.expo.plugins).toEqual(["expo-router"]);
    expect(plain.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
  });
});
