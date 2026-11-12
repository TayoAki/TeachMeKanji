import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { fixtureProject } from "../project";
import { canRenderScreens, closeRenderer } from "../render/screens";
import { checkRegressions, dependencyClosure, pixelDiff, reachableScreens } from "./regression";

const STATS = "app/(tabs)/stats.tsx";
const HOME = "app/(tabs)/index.tsx";

describe("which screens an edit can reach", () => {
  it("follows relative imports and the layouts above a screen", async () => {
    const files = await fixtureProject("habit-tracker");
    expect(dependencyClosure(files, STATS).has("components/Card.tsx")).toBe(true);
    expect(dependencyClosure(files, HOME).has("components/Card.tsx")).toBe(false);

    const card = { ...files, "components/Card.tsx": files["components/Card.tsx"] + "\n" };
    // Stats and the habit detail screen show cards; Home doesn't.
    expect(reachableScreens(files, card, ["components/Card.tsx"])).toEqual([
      STATS,
      "app/habit/[id].tsx",
    ]);

    const tabs = reachableScreens(files, files, ["app/(tabs)/_layout.tsx"]);
    expect(tabs).toContain(HOME);
    expect(tabs).toContain(STATS);
    expect(tabs).not.toContain("app/add-habit.tsx");
  });

  it("measures how much of a screenshot changed", async () => {
    const solid = (r: number) =>
      sharp({
        create: { width: 390, height: 844, channels: 3, background: { r, g: 0, b: 0 } },
      })
        .png()
        .toBuffer();
    const [red, black] = await Promise.all([solid(255), solid(0)]);
    expect(await pixelDiff(red, red)).toBe(0);
    expect(await pixelDiff(red, black)).toBe(1);
  });
});

describe("the regression lock on a real render", () => {
  afterAll(() => closeRenderer());

  it("finds a screen the edit broke, and screens it changed outside the request", async ({
    skip,
  }) => {
    if (!(await canRenderScreens())) skip();
    const before = await fixtureProject("habit-tracker");

    // An edit "about Home" that also broke Stats.
    const broken = {
      ...before,
      [STATS]: before[STATS]!.replace(
        "export default function",
        'function boom(): never { throw new Error("stats exploded"); }\nexport default function',
      ).replace("const theme = useTheme();", "const theme = useTheme();\n  boom();"),
    };
    const report = await checkRegressions({
      before,
      after: broken,
      changed: [STATS],
      settleMs: 150,
    });
    expect(report!.broken.map((b) => b.path)).toEqual([STATS]);
    expect(report!.broken[0]!.error).toContain("stats exploded");

    // The user asked about Home; the edit restyled the shared Card, which Stats shows.
    const restyled = {
      ...before,
      "components/Card.tsx": before["components/Card.tsx"]!.replace(
        "backgroundColor: theme.colors.surface,",
        'backgroundColor: "#ff00aa",',
      ),
    };
    const scoped = await checkRegressions({
      before,
      after: restyled,
      changed: ["components/Card.tsx"],
      selected: HOME,
      settleMs: 150,
      mockups: new Map([[STATS, Buffer.from("mockup")]]),
      // Before the edit Stats matched its mockup at 90%, after it at 62%.
      score: (() => {
        const scores = [90, 62];
        return async () => scores.shift()!;
      })(),
    });
    expect(scoped!.broken).toEqual([]);
    expect(scoped!.alsoChanged).toEqual([STATS, "app/habit/[id].tsx"]);
    expect(scoped!.drifted).toEqual([{ path: STATS, before: 90, after: 62 }]);

    // Without a selection the request may be about the whole app: nothing is "outside" it.
    const global = await checkRegressions({
      before,
      after: restyled,
      changed: ["components/Card.tsx"],
      settleMs: 150,
    });
    expect(global!.alsoChanged).toEqual([]);
  }, 120_000);
});
