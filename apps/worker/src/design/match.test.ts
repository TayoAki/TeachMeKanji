import type Anthropic from "@anthropic-ai/sdk";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { appImagesFile, IMAGES_FILE, readAppImages } from "@appbuilder/contract";
import type { CreateMessage } from "../generation/client";
import { fakeCreateMessage } from "../generation/fake-provider";
import { normalizePoses } from "../images/key";
import { fixtureProject } from "../project";
import { canRenderScreens, closeRenderer, renderScreens } from "../render/screens";
import { compareScreen, fixRequest, MATCH_SYSTEM } from "./match";
import { matchSummary } from "./match-loop";
import { picturePrompts, withPictures } from "./pictures";

process.env.FAKE_LLM_DELAY_MS = "0";

const answer = (text: string): CreateMessage =>
  (async () =>
    ({
      content: [{ type: "text", text }],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 10,
        output_tokens: 5,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    }) as unknown as Anthropic.Beta.Messages.BetaMessage) as CreateMessage;

const png = (w: number, h: number) =>
  sharp({
    create: { width: w, height: h, channels: 4, background: { r: 30, g: 60, b: 120, alpha: 1 } },
  })
    .png()
    .toBuffer();

describe("pictures the app describes", () => {
  it("finds literal prompts (any quoting) but not computed ones or ones already drawn", () => {
    const files = {
      "app/(tabs)/index.tsx": `<AiImage prompt="A moonlit hill with a cabin" style={s} />
<AiImage style={s} prompt={'Stars over a quiet lake'} />
<AiImage prompt={\`A sleeping fox\`} />
<AiImage prompt={item.title} />`,
      "components/Hero.tsx": `<AiImage prompt="A moonlit hill with a cabin" />`,
      // The platform's own component documents prompt="..." in a comment; that isn't a picture.
      "components/AiImage.tsx": `// <AiImage prompt="..." /> generates one`,
      "app/(tabs)/stats.tsx": `<AiImage prompt="..." />`,
      [IMAGES_FILE]: appImagesFile({ "A sleeping fox": "https://x/fox" }),
    };
    expect(picturePrompts(files)).toEqual([
      "A moonlit hill with a cabin",
      "Stars over a quiet lake",
    ]);
    const next = withPictures(files, { "Stars over a quiet lake": "https://x/lake" });
    expect(readAppImages(next)).toEqual({
      "A sleeping fox": "https://x/fox",
      "Stars over a quiet lake": "https://x/lake",
    });
  });
});

describe("mascot poses", () => {
  it("puts every pose on one canvas at one scale, standing on the same spot", async () => {
    const [tall, wide] = await normalizePoses([await png(200, 400), await png(400, 200)]);
    for (const pose of [tall!, wide!]) {
      const meta = await sharp(pose).metadata();
      expect([meta.width, meta.height]).toEqual([512, 512]);
    }
    const box = async (p: Buffer) => {
      const { data, info } = await sharp(p).raw().toBuffer({ resolveWithObject: true });
      let top = info.height,
        bottom = 0,
        left = info.width,
        right = 0;
      for (let y = 0; y < info.height; y++)
        for (let x = 0; x < info.width; x++)
          if (data[(y * info.width + x) * 4 + 3]! > 0) {
            top = Math.min(top, y);
            bottom = Math.max(bottom, y);
            left = Math.min(left, x);
            right = Math.max(right, x);
          }
      return { width: right - left + 1, height: bottom - top + 1, bottom };
    };
    const a = await box(tall!);
    const b = await box(wide!);
    // Same scale (the tall pose is as tall as the wide one is wide) and the same footing.
    expect(a.height).toBe(b.width);
    expect(a.bottom).toBe(b.bottom);
  });
});

describe("the match check", () => {
  it("reads the score, the gaps and missing pictures, and clamps what it can't trust", async () => {
    const shot = await png(390, 844);
    const good = await compareScreen({
      createMessage: answer(
        JSON.stringify({
          score: 78,
          gaps: [{ issue: "The score card has no gradient.", fix: "Wrap it in a LinearGradient." }],
          missingPictures: ["the moth mascot"],
        }),
      ),
      model: "m",
      title: "Tonight",
      mockup: shot,
      shot,
    });
    expect(good.score).toBe(78);
    expect(good.gaps).toHaveLength(1);
    expect(good.missingPictures).toEqual(["the moth mascot"]);
    const bad = await compareScreen({
      createMessage: answer("not json"),
      model: "m",
      title: "x",
      mockup: shot,
      shot,
    });
    expect(bad.score).toBe(0);
    expect(bad.gaps).toEqual([]);
  });

  it("answers offline as a match, so offline builds don't loop", async () => {
    const shot = await png(10, 10);
    const r = await compareScreen({
      createMessage: fakeCreateMessage,
      model: "fake",
      title: "x",
      mockup: shot,
      shot,
    });
    expect(r.score).toBeGreaterThanOrEqual(90);
    expect(MATCH_SYSTEM.startsWith("You compare an app screen")).toBe(true);
  });

  it("asks for a full rewrite with the gaps, the mascot and missing pictures", () => {
    const text = fixRequest({
      path: "app/(tabs)/index.tsx",
      componentDir: "components/index/",
      match: {
        score: 70,
        gaps: [{ issue: "Cards are flat.", fix: "Add the surface color and radius." }],
        missingPictures: ["a moon over hills"],
      },
      imageNames: ["nod-neutral"],
    });
    expect(text).toContain("about 70%");
    expect(text).toContain("Cards are flat. Fix: Add the surface color and radius.");
    expect(text).toContain('"nod-neutral"');
    expect(text).toContain('<AiImage prompt="the description"');
  });

  it("summarizes each screen's score and what still differs", () => {
    const text = matchSummary({
      files: {},
      versionId: "v",
      rounds: 1,
      screens: [
        { path: "a", title: "Tonight", first: 72, score: 93, gaps: [] },
        { path: "b", title: "Trends", first: 80, score: 84, gaps: ["The chart has no labels."] },
      ],
    });
    expect(text).toContain("Tonight 93% (was 72%)");
    expect(text).toContain("Trends: The chart has no labels.");
  });
});

describe("rendering screens on the worker", () => {
  afterAll(() => closeRenderer());

  it("renders each screen of a real app at phone size", async ({ skip }) => {
    if (!(await canRenderScreens())) skip();
    const files = await fixtureProject("habit-tracker");
    const shots = await renderScreens(files, { settleMs: 200 });
    expect(shots.length).toBeGreaterThan(1);
    for (const shot of shots) {
      expect(shot.error ?? null, shot.file).toBeNull();
      const meta = await sharp(shot.png!).metadata();
      expect([meta.width, meta.height]).toEqual([780, 1688]);
    }
  }, 120_000);
});
