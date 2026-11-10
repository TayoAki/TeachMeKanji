// SRT for the fit cut, from the same cue math as the burned-in captions (src/remotion/hero/fit.ts).
import fs from "node:fs";
import { build } from "esbuild";
const out = await build({ entryPoints: ["src/remotion/hero/fit.ts"], bundle: true, format: "esm", write: false, platform: "node" });
const mod = await import("data:text/javascript;base64," + Buffer.from(out.outputFiles[0].text).toString("base64"));
const ts = (x) => {
  const ms = Math.round(x * 1000);
  const p = (n, w = 2) => String(n).padStart(w, "0");
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor((ms % 3600000) / 60000))}:${p(Math.floor((ms % 60000) / 1000))},${p(ms % 1000, 3)}`;
};
const srt = mod.FIT_CUES.map((c, i) => `${i + 1}\n${ts(c.s)} --> ${ts(c.e)}\n${c.text}\n`).join("\n");
fs.writeFileSync(process.argv[2], srt);
console.log(process.argv[2], mod.FIT_CUES.length, "cues");
for (const c of mod.FIT_CUES) for (const l of c.text.split("\n")) if (l.length > 32) console.log("LONG:", l);
for (const c of mod.FIT_CUES) console.log(c.s.toFixed(2), "-", c.e.toFixed(2), c.text.replace("\n", " / "));
