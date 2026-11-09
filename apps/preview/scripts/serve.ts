/**
 * Production server for the preview origin: serves dist/ with the security headers.
 * (Static hosts can instead use dist/_headers.)   tsx scripts/serve.ts --port 3001
 */
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { securityHeaders } from "./headers";
import { staticPath } from "./static";

const dist = join(dirname(dirname(fileURLToPath(import.meta.url))), "dist");
const args = process.argv.slice(2);
const port = Number(args[args.indexOf("--port") + 1] || process.env.PORT || 3001);
const TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".map": "application/json",
  ".ttf": "font/ttf",
};

createServer(async (req, res) => {
  const file = staticPath(dist, req.url);
  if (!file) {
    res.writeHead(400).end();
    return;
  }
  try {
    const body = await readFile(file);
    const cache = extname(file) === ".html" ? "no-cache" : "public, max-age=3600";
    res.writeHead(200, {
      "Content-Type": TYPES[extname(file)] ?? "application/octet-stream",
      "Cache-Control": cache,
      ...securityHeaders(),
    });
    res.end(body);
  } catch {
    res.writeHead(404).end("not found");
  }
}).listen(port, () => console.log(`preview runtime (production) on http://localhost:${port}`));
