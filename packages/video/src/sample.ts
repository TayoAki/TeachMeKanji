/**
 * Render a sample film for development: `npm run sample -w @appbuilder/video -- <out-dir>
 * <vertical|landscape> <screen.png>...` (2 to 5 screens). Uses VIDEO_BROWSER_EXECUTABLE and
 * VIDEO_BUNDLE_DIR like the worker.
 */
import { readFile } from "node:fs/promises";
import { isPromoFormat, normalizePromoColors } from "@appbuilder/contract";
import { renderPromo } from "./render";

const [outDir, format, ...images] = process.argv.slice(2);
if (!outDir || !isPromoFormat(format) || images.length < 2) {
  console.error("usage: sample <out-dir> <vertical|landscape> <screen.png> <screen.png> [...]");
  process.exit(1);
}
const captions = [
  "Ten new kanji every morning",
  "Stroke order, step by step",
  "Reviews that come back on time",
  "Watch your streak grow",
  "Quiz yourself in a minute",
];
const started = Date.now();
const result = await renderPromo({
  props: {
    format,
    appName: "Kanjiwa",
    colors: normalizePromoColors({
      background: "#0f1115",
      surface: "#181b22",
      text: "#f4f4f5",
      textMuted: "#a1a1aa",
      primary: "#e5484d",
      onPrimary: "#ffffff",
    }),
    storyboard: {
      hook: "Read Japanese in 10 minutes a day",
      beats: images.slice(0, 5).map((image, i) => ({
        screen: image,
        caption: captions[i]!,
        focus: (["top", "middle", "top", "bottom", "middle"] as const)[i]!,
      })),
      tagline: "Kanji, one calm minute at a time",
      cta: "Coming soon to iPhone",
    },
  },
  shots: await Promise.all(images.slice(0, 5).map((image) => readFile(image))),
  music: null,
  outDir,
  onProgress: (p) => process.stdout.write(`\r${Math.round(p * 100)}%`),
});
console.log(`\n${JSON.stringify(result)} in ${((Date.now() - started) / 1000).toFixed(1)} s`);
