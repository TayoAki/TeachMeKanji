/**
 * The regression lock. After a chat edit, every screen the change can reach (its own file, or
 * anything it imports, or a layout above it) is rendered before and after the edit:
 *
 * - broken: it rendered before and fails now (or a new screen fails to render);
 * - drifted: the request was about one screen or element, this screen is built from an approved
 *   mockup, the request didn't target it, and it now matches its mockup clearly less;
 * - also changed: the request was about one screen or element and this other screen looks
 *   different (rendered twice before the edit to rule out screens that never look the same).
 *
 * The edit handler repairs broken and drifted screens once, for free, and keeps the app as it was
 * when a screen is still broken (see handleEdit).
 */
import sharp from "sharp";
import {
  buildRouteTree,
  collectImports,
  parseModule,
  resolveRelative,
  screens as listScreens,
  type ProjectFiles,
} from "@appbuilder/contract";
import { canRenderScreens, renderScreens } from "../render/screens";

/** Screens rendered at most per check (the edit's own screens first). */
const MAX_SCREENS = Number(process.env.REGRESSION_MAX_SCREENS) || 12;
/** A screen whose match score drops this much below its pre-edit score has drifted. */
export const DRIFT_POINTS = 10;
/** Share of pixels that must differ for a screen to count as changed. */
const CHANGED = 0.003;
/** Two renders of the same files differ less than this on a screen that renders the same. */
const STABLE = 0.001;

export interface RegressionReport {
  broken: Array<{ path: string; error: string }>;
  drifted: Array<{ path: string; before: number; after: number }>;
  alsoChanged: string[];
  /** The screens rendered after the edit, for a later look (by path). */
  checked: string[];
}

/** Every file a module reaches through relative imports, itself included. */
export function dependencyClosure(files: ProjectFiles, entry: string): Set<string> {
  const paths = new Set(Object.keys(files));
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length) {
    const path = stack.pop()!;
    if (seen.has(path) || !(path in files)) continue;
    seen.add(path);
    if (!/\.tsx?$/.test(path)) continue;
    const parsed = parseModule(files[path]!);
    if (!parsed.ok) continue;
    for (const imp of collectImports(parsed.ast)) {
      if (!imp.source.startsWith(".")) continue;
      const target = resolveRelative(path, imp.source, paths);
      if (target) stack.push(target);
    }
  }
  return seen;
}

/** The layouts a screen renders inside: every _layout.tsx from app/ down to its folder. */
function layoutsAbove(screen: string, files: ProjectFiles): string[] {
  const parts = screen.split("/").slice(0, -1);
  const out: string[] = [];
  for (let i = 1; i <= parts.length; i++) {
    const layout = `${parts.slice(0, i).join("/")}/_layout.tsx`;
    if (layout in files) out.push(layout);
  }
  return out;
}

function screenFiles(files: ProjectFiles): string[] {
  try {
    return listScreens(buildRouteTree(Object.keys(files))).map((s) => s.screen.file);
  } catch {
    return [];
  }
}

/** The screens (in the edited app) whose rendering a change to `changed` can affect. */
export function reachableScreens(
  before: ProjectFiles,
  after: ProjectFiles,
  changed: readonly string[],
): string[] {
  const touched = new Set(changed);
  return screenFiles(after).filter((screen) => {
    if (!(screen in before)) return true; // a new screen
    for (const files of [before, after]) {
      for (const layout of layoutsAbove(screen, files))
        for (const path of dependencyClosure(files, layout)) if (touched.has(path)) return true;
      for (const path of dependencyClosure(files, screen)) if (touched.has(path)) return true;
    }
    return false;
  });
}

/** The share of pixels that differ visibly between two screenshots (compared at quarter size). */
export async function pixelDiff(a: Buffer, b: Buffer): Promise<number> {
  const size = { width: 195, height: 422, fit: "fill" as const };
  const [x, y] = await Promise.all(
    [a, b].map((png) => sharp(png).resize(size).removeAlpha().raw().toBuffer()),
  );
  let differing = 0;
  const pixels = size.width * size.height;
  for (let i = 0; i < pixels; i++) {
    const o = i * 3;
    const delta = Math.max(
      Math.abs(x![o]! - y![o]!),
      Math.abs(x![o + 1]! - y![o + 1]!),
      Math.abs(x![o + 2]! - y![o + 2]!),
    );
    if (delta > 24) differing++;
  }
  return differing / pixels;
}

export async function checkRegressions(input: {
  before: ProjectFiles;
  after: ProjectFiles;
  changed: readonly string[];
  /** The screen the user selected (or the screen of the element they selected). */
  selected?: string | null;
  themeId?: string;
  storage?: Record<string, string>;
  settleMs?: number;
  /** Approved mockups by screen path, with a scorer: present when the app was built from them. */
  mockups?: Map<string, Buffer>;
  score?: (path: string, shot: Buffer) => Promise<number>;
  /** Each planned screen's own component folder (components/<key>/), by screen path. */
  componentDirs?: Record<string, string>;
  /** Only these screens (a re-check after a repair). */
  only?: string[];
}): Promise<RegressionReport | null> {
  if (!(await canRenderScreens())) return null;
  const touched = new Set(input.changed);
  // A screen the edit wrote itself (or whose own component folder it wrote) is what was asked.
  const targeted = (screen: string) => {
    const dir = input.componentDirs?.[screen];
    return (
      touched.has(screen) ||
      screen === input.selected ||
      Boolean(dir && [...touched].some((p) => p.startsWith(dir)))
    );
  };
  let paths = input.only ?? reachableScreens(input.before, input.after, input.changed);
  paths = [...paths.filter(targeted), ...paths.filter((p) => !targeted(p))].slice(0, MAX_SCREENS);
  const report: RegressionReport = { broken: [], drifted: [], alsoChanged: [], checked: paths };
  if (!paths.length) return report;

  const options = { themeId: input.themeId, storage: input.storage, settleMs: input.settleMs };
  // A render that timed out says nothing about the screen (a busy machine): try it once more,
  // and leave it out if it times out again.
  const render = async (files: ProjectFiles, only: string[]) => {
    const shots = await renderScreens(files, { ...options, only });
    const slow = shots.filter((r) => r.timedOut).map((r) => r.file);
    if (!slow.length) return shots;
    const again = new Map(
      (await renderScreens(files, { ...options, only: slow })).map((r) => [r.file, r]),
    );
    return shots.map((r) => (r.timedOut ? (again.get(r.file) ?? r) : r)).filter((r) => !r.timedOut);
  };
  const existing = paths.filter((p) => p in input.before);
  const beforeShots = await render(input.before, existing);
  const afterShots = await render(input.after, paths);
  const before = new Map(beforeShots.map((r) => [r.file, r]));
  const candidates: string[] = [];
  for (const shot of afterShots) {
    const was = before.get(shot.file);
    // Its render before the edit timed out: nothing to compare with.
    if (!was && shot.file in input.before) continue;
    const rendered = (r: typeof shot | undefined) => Boolean(r?.png && !r.error);
    if (!rendered(shot)) {
      if (!was || rendered(was))
        report.broken.push({ path: shot.file, error: shot.error ?? "The screen didn't render." });
      continue;
    }
    if (!input.selected || targeted(shot.file) || !was?.png || was.error) continue;
    if ((await pixelDiff(was.png, shot.png!)) > CHANGED) candidates.push(shot.file);
  }
  if (candidates.length) {
    // A screen that differs between two renders of the same files (a clock, random data) isn't
    // telling us anything about the edit.
    const again = await renderScreens(input.before, { ...options, only: candidates });
    for (const shot of again) {
      const first = before.get(shot.file)?.png;
      if (shot.png && first && (await pixelDiff(first, shot.png)) < STABLE)
        report.alsoChanged.push(shot.file);
    }
  }
  if (input.mockups && input.score) {
    const after = new Map(afterShots.map((r) => [r.file, r]));
    await Promise.all(
      report.alsoChanged
        .filter((path) => input.mockups!.has(path))
        .map(async (path) => {
          const [was, now] = await Promise.all([
            input.score!(path, before.get(path)!.png!),
            input.score!(path, after.get(path)!.png!),
          ]);
          if (was - now >= DRIFT_POINTS) report.drifted.push({ path, before: was, after: now });
        }),
    );
  }
  return report;
}
