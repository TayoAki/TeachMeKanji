/**
 * Builds the preview runtime into dist/ (runtime.js + index.html + fonts).
 *   tsx scripts/build.ts                 production build
 *   tsx scripts/build.ts --serve         watch + dev server (default port 3001)
 *
 * The preview must be served from a different origin than the app, with the headers from
 * `securityHeaders()` (see dist/_headers for static hosts).
 */
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(root, "dist");
const require = createRequire(import.meta.url);
const args = process.argv.slice(2);
const serve = args.includes("--serve");
const port = Number(args[args.indexOf("--port") + 1] || process.env.PORT || 3001);

import { securityHeaders } from "./headers";
import { staticPath } from "./static";

const options: esbuild.BuildOptions = {
  entryPoints: [join(root, "src/runtime.tsx")],
  outfile: join(dist, "runtime.js"),
  bundle: true,
  format: "iife",
  platform: "browser",
  target: "es2022",
  jsx: "automatic",
  minify: !serve,
  sourcemap: true,
  alias: { "react-native": "react-native-web" },
  define: {
    "process.env.NODE_ENV": JSON.stringify(serve ? "development" : "production"),
    global: "globalThis",
  },
  resolveExtensions: [".web.tsx", ".web.ts", ".web.js", ".tsx", ".ts", ".js", ".json"],
  logLevel: "info",
};

async function copyStatic() {
  await mkdir(join(dist, "fonts"), { recursive: true });
  await copyFile(join(root, "public/index.html"), join(dist, "index.html"));
  const iconsDir = dirname(require.resolve("@expo/vector-icons/package.json"));
  await copyFile(
    join(iconsDir, "build/vendor/react-native-vector-icons/Fonts/Ionicons.ttf"),
    join(dist, "fonts/Ionicons.ttf"),
  );
  const headers = Object.entries(securityHeaders())
    .map(([k, v]) => `  ${k}: ${v}`)
    .join("\n");
  await writeFile(join(dist, "_headers"), `/*\n${headers}\n`);
}

const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json",
  ".ttf": "font/ttf",
};

if (serve) {
  await copyStatic();
  const context = await esbuild.context(options);
  await context.watch();
  createServer(async (req, res) => {
    const file = staticPath(dist, req.url);
    if (!file) {
      res.writeHead(400).end();
      return;
    }
    try {
      const body = await readFile(file);
      res.writeHead(200, {
        "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
        ...securityHeaders(),
      });
      res.end(body);
    } catch {
      res.writeHead(404).end("not found");
    }
  }).listen(port, () => console.log(`preview runtime on http://localhost:${port}`));
} else {
  await esbuild.build(options);
  await copyStatic();
}
