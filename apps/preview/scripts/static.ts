import { normalize, resolve, sep } from "node:path";

/**
 * Map a request URL to a file under `root`. Returns null for malformed URLs (bad percent
 * escapes must not crash the server) and for anything that would leave `root`.
 */
export function staticPath(root: string, url: string | undefined): string | null {
  let path: string;
  try {
    path = decodeURIComponent((url ?? "/").split(/[?#]/)[0]!);
  } catch {
    return null;
  }
  if (path.includes("\0")) return null;
  if (path === "/" || path === "") return resolve(root, "index.html");
  // Normalizing from "/" collapses every ".." at the root, so the result stays inside it.
  const file = resolve(root, `.${normalize(`/${path}`)}`);
  return file.startsWith(root + sep) ? file : null;
}
