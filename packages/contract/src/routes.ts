/**
 * Expo Router's file-based route tree, derived from file paths only.
 * Used by the preview runtime's router shim and by the validator.
 *
 * app/_layout.tsx            -> root layout (Stack)
 * app/(tabs)/_layout.tsx     -> layout "(tabs)" (Tabs), no URL segment
 * app/(tabs)/index.tsx       -> screen "index"       url "/"
 * app/(tabs)/stats.tsx       -> screen "stats"       url "/stats"
 * app/habit/[id].tsx         -> screen "habit/[id]"  url "/habit/:id" (no layout in habit/)
 */

export type Segment = { type: "static"; value: string } | { type: "param"; name: string };

export interface ScreenRoute {
  kind: "screen";
  /** Name relative to the parent layout, as used in <Stack.Screen name="..."> */
  name: string;
  file: string;
  pattern: Segment[];
}

export interface LayoutRoute {
  kind: "layout";
  name: string;
  /** null when the directory has no _layout file (a default Stack is implied). */
  file: string | null;
  dir: string;
  children: RouteNode[];
}

export type RouteNode = ScreenRoute | LayoutRoute;

export interface RouteMatch {
  /** Layouts from the root down to the screen's parent. */
  layouts: LayoutRoute[];
  screen: ScreenRoute;
  params: Record<string, string>;
}

const ROUTE_FILE = /\.(tsx|ts|jsx|js)$/;

export function buildRouteTree(paths: Iterable<string>): LayoutRoute {
  const appFiles = [...paths].filter((p) => p.startsWith("app/") && ROUTE_FILE.test(p));
  return buildLayout("app", "", appFiles);
}

function buildLayout(dir: string, name: string, files: string[]): LayoutRoute {
  const layoutFile = files.find((f) => f === `${dir}/_layout.tsx` || f === `${dir}/_layout.ts`);
  return {
    kind: "layout",
    name,
    file: layoutFile ?? null,
    dir,
    children: collectChildren(dir, "", files),
  };
}

/** Children of the layout at `layoutDir`, scanning `layoutDir/prefix`. */
function collectChildren(layoutDir: string, prefix: string, files: string[]): RouteNode[] {
  const scanDir = prefix ? `${layoutDir}/${prefix}` : layoutDir;
  const children: RouteNode[] = [];
  const subdirs = new Set<string>();

  for (const file of files) {
    if (!file.startsWith(`${scanDir}/`)) continue;
    const rest = file.slice(scanDir.length + 1);
    const slash = rest.indexOf("/");
    if (slash !== -1) {
      subdirs.add(rest.slice(0, slash));
      continue;
    }
    const base = rest.replace(ROUTE_FILE, "");
    if (base === "_layout" || base.startsWith("+")) continue;
    const name = prefix ? `${prefix}/${base}` : base;
    children.push({ kind: "screen", name, file, pattern: toPattern(file) });
  }

  for (const sub of [...subdirs].sort()) {
    const subDir = `${scanDir}/${sub}`;
    const hasLayout = files.some(
      (f) => f === `${subDir}/_layout.tsx` || f === `${subDir}/_layout.ts`,
    );
    const childName = prefix ? `${prefix}/${sub}` : sub;
    if (hasLayout) children.push(buildLayout(subDir, childName, files));
    else children.push(...collectChildren(layoutDir, childName, files));
  }
  return children;
}

function toPattern(file: string): Segment[] {
  const parts = file
    .replace(/^app\//, "")
    .replace(ROUTE_FILE, "")
    .split("/");
  const segments: Segment[] = [];
  parts.forEach((part, i) => {
    if (/^\(.*\)$/.test(part)) return; // groups add no URL segment
    if (part === "index" && i === parts.length - 1) return;
    const param = /^\[(?:\.\.\.)?(.+)\]$/.exec(part);
    segments.push(param ? { type: "param", name: param[1]! } : { type: "static", value: part });
  });
  return segments;
}

export function screens(tree: LayoutRoute): Array<{ layouts: LayoutRoute[]; screen: ScreenRoute }> {
  const out: Array<{ layouts: LayoutRoute[]; screen: ScreenRoute }> = [];
  const visit = (layout: LayoutRoute, chain: LayoutRoute[]) => {
    for (const child of layout.children) {
      if (child.kind === "screen") out.push({ layouts: [...chain, layout], screen: child });
      else visit(child, [...chain, layout]);
    }
  };
  visit(tree, []);
  return out;
}

export function splitHref(href: string): { pathname: string; query: Record<string, string> } {
  const [pathPart, queryPart] = href.split("?", 2);
  const query: Record<string, string> = {};
  if (queryPart) {
    for (const pair of queryPart.split("&")) {
      const [k, v = ""] = pair.split("=");
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v);
    }
  }
  const pathname = "/" + (pathPart ?? "").split("/").filter(Boolean).join("/");
  return { pathname, query };
}

export function matchRoute(tree: LayoutRoute, href: string): RouteMatch | null {
  const { pathname, query } = splitHref(href);
  const parts = pathname.split("/").filter(Boolean).map(decodeURIComponent);
  let best: { match: RouteMatch; score: number } | null = null;

  for (const { layouts, screen } of screens(tree)) {
    if (screen.pattern.length !== parts.length) continue;
    const params: Record<string, string> = {};
    let score = 0;
    let ok = true;
    screen.pattern.forEach((segment, i) => {
      const part = parts[i]!;
      if (segment.type === "static") {
        if (segment.value !== part) ok = false;
        else score += 2;
      } else {
        params[segment.name] = part;
        score += 1;
      }
    });
    if (ok && (!best || score > best.score)) {
      best = { match: { layouts, screen, params: { ...query, ...params } }, score };
    }
  }
  return best?.match ?? null;
}

/** Build the href for a screen, filling dynamic segments from params. */
export function hrefFor(screen: ScreenRoute, params: Record<string, string> = {}): string {
  return (
    "/" +
    screen.pattern
      .map((s) => (s.type === "static" ? s.value : encodeURIComponent(params[s.name] ?? s.name)))
      .join("/")
  );
}

/** Resolve an href object or string the way expo-router's Link/router accept them. */
export function normalizeHref(
  href: string | { pathname: string; params?: Record<string, string | number> },
): string {
  if (typeof href === "string") return href;
  let pathname = href.pathname;
  const rest: Record<string, string> = {};
  for (const [key, value] of Object.entries(href.params ?? {})) {
    const token = `[${key}]`;
    if (pathname.includes(token))
      pathname = pathname.replace(token, encodeURIComponent(String(value)));
    else rest[key] = String(value);
  }
  const query = Object.entries(rest)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");
  return query ? `${pathname}?${query}` : pathname;
}
