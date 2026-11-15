// Write a hand-built studio app (studio/<name>) as a complete Expo project: the platform's
// template with the app's files on top, as the factory builds it.
//   npm run studio:export -- stylist ../closetcast
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { validateProject, withAppStructure } from "@appbuilder/contract";
import { loadProject } from "@appbuilder/contract/node";

const root = fileURLToPath(new URL("../", import.meta.url));
const [name, out] = process.argv.slice(2);
if (!name || !out) {
  console.error("Usage: npm run studio:export -- <studio app> <output folder>");
  process.exit(1);
}

const files = withAppStructure(
  await loadProject(join(root, "templates/expo-app"), join(root, "studio", name)),
);
const errors = validateProject(files).filter((issue) => issue.severity === "error");
if (errors.length) {
  for (const e of errors) console.error(`${e.path}:${e.line ?? ""} ${e.message}`);
  process.exit(1);
}

const target = resolve(out);
for (const sub of ["app", "components", "data", "theme"])
  rmSync(join(target, sub), { recursive: true, force: true });
for (const [path, text] of Object.entries(files)) {
  mkdirSync(dirname(join(target, path)), { recursive: true });
  writeFileSync(join(target, path), text);
}
console.log(
  `Wrote ${Object.keys(files).length} files to ${target}. Next: cd there, npm install, npx expo start.`,
);
