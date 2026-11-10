// Render many stills from one bundle: node scripts/stills.mjs <composition> <outDir> <scale> t1 t2 …  (times in seconds)
import { bundle } from "@remotion/bundler";
import { renderStill, selectComposition } from "@remotion/renderer";
import path from "node:path";
import fs from "node:fs";

const [comp, outDir, scaleArg, ...times] = process.argv.slice(2);
const root = path.resolve(".");
fs.mkdirSync(outDir, { recursive: true });
const serveUrl = await bundle({
  entryPoint: path.join(root, "src/remotion/index.ts"),
  publicDir: path.join(root, "video/public"),
  onProgress: () => {},
});
const browserExecutable =
  "/opt/pw-browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell";
const composition = await selectComposition({ serveUrl, id: comp, browserExecutable });
for (const tArg of times) {
  const [name, tStr] = tArg.includes("=") ? tArg.split("=") : [null, tArg];
  const frame = Math.min(composition.durationInFrames - 1, Math.round(Number(tStr) * composition.fps));
  const output = path.join(outDir, `${name ?? `t${String(tStr).replace(".", "_")}`}.png`);
  await renderStill({ composition, serveUrl, output, frame, scale: Number(scaleArg), browserExecutable, chromiumOptions: { gl: "swangle" } });
  console.log(output, "frame", frame);
}
