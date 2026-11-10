// Write the vertical's captions as SRT from the same cues the film burns in (src/remotion/hero/vo.ts).
import fs from "node:fs";
const src = fs.readFileSync("src/remotion/hero/vo.ts", "utf8");
const block = src.slice(src.indexOf("export const CUES"), src.indexOf("];", src.indexOf("export const CUES")));
const cues = [...block.matchAll(/\{ s: ([\d.]+), e: ([\d.]+), text: "((?:[^"\\]|\\.)*)" \}/g)].map((m) => ({
  s: Number(m[1]),
  e: Number(m[2]),
  text: JSON.parse(`"${m[3]}"`),
}));
const ts = (x) => {
  const ms = Math.round(x * 1000);
  const h = Math.floor(ms / 3600000), m = Math.floor((ms % 3600000) / 60000), s = Math.floor((ms % 60000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
const out = cues.map((c, i) => `${i + 1}\n${ts(c.s)} --> ${ts(c.e)}\n${c.text}\n`).join("\n");
fs.writeFileSync(process.argv[2], out);
console.log(process.argv[2], cues.length, "cues");
for (const c of cues) for (const line of c.text.split("\n")) if (line.length > 32) console.log("LONG LINE:", line);
