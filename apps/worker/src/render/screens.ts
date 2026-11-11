/**
 * Renders a built app's screens on the worker the way the builder's canvas shows them: the
 * preview runtime (apps/preview/dist/runtime.js) in a headless Chrome page, each screen loaded in
 * the preview's still "screen" mode at the canvas's phone size, then a screenshot. The match
 * check compares these with the approved mockups. Chrome is the one the image already ships for
 * promo videos (VIDEO_BROWSER_EXECUTABLE); without a browser, rendering reports it can't run.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { chromium, type Browser } from "playwright-core";
import {
  buildRouteTree,
  screens as listScreens,
  type ProjectFiles,
  type ScreenRoute,
} from "@appbuilder/contract";
import { REPO_ROOT } from "../project";

/** The canvas's device size (points). */
export const DEVICE = { width: 390, height: 844 };

const RUNTIME = join(REPO_ROOT, "apps/preview/dist/runtime.js");
const FONT = join(REPO_ROOT, "apps/preview/dist/fonts/Ionicons.ttf");

export class RenderUnavailable extends Error {}

export interface RenderedScreen {
  /** The screen's file, e.g. app/(tabs)/index.tsx. */
  file: string;
  png: Buffer | null;
  /** What the preview reported when the screen failed to render. */
  error?: string;
}

/** The href the canvas loads a screen at (dynamic segments resolve to sample data). */
export function canvasHref(screen: ScreenRoute): string {
  return "/" + screen.pattern.map((s) => (s.type === "static" ? s.value : `[${s.name}]`)).join("/");
}

let browser: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  browser ??= chromium
    .launch({
      executablePath: process.env.VIDEO_BROWSER_EXECUTABLE || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    })
    .catch((error: Error) => {
      browser = null;
      throw new RenderUnavailable(
        `No browser to render screens with (${error.message.split("\n")[0]}).`,
      );
    });
  return browser;
}

/** True when this worker can render screens: the preview runtime is built and Chrome starts. */
export async function canRenderScreens(): Promise<boolean> {
  if (process.env.MATCH_STEP === "0" || !existsSync(RUNTIME)) return false;
  try {
    await getBrowser();
    return true;
  } catch {
    return false;
  }
}

function page(): string {
  const runtime = readFileSync(RUNTIME, "utf8").replace(/<!--/g, "\\x3C!--");
  const font = existsSync(FONT) ? readFileSync(FONT).toString("base64") : "";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<style>${font ? `@font-face{font-family:"Ionicons";src:url(data:font/ttf;base64,${font}) format("truetype");font-display:block}` : ""}
html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}</style></head>
<body><div id="root"></div><script>window.__messages=[];window.addEventListener("message",function(e){if(e.data&&e.data.type)window.__messages.push(e.data)});</script>
<script>${runtime}</script></body></html>`;
}

/**
 * Screenshot the given screens (all of the app's screens when `only` is empty), one at a time in
 * one page. A screen that throws is returned with its error and no image.
 */
// One render at a time per worker: parallel builds would otherwise each drive Chrome at once.
let queue: Promise<unknown> = Promise.resolve();

export async function renderScreens(
  ...args: Parameters<typeof renderScreensNow>
): Promise<RenderedScreen[]> {
  const run = queue.then(() => renderScreensNow(...args));
  queue = run.catch(() => {});
  return run;
}

async function renderScreensNow(
  files: ProjectFiles,
  options: {
    themeId?: string;
    only?: string[];
    settleMs?: number;
    /** The preview's storage, e.g. an App Cloud session for the preview user's sample data. */
    storage?: Record<string, string>;
    /** A taller canvas shows more of a long screen (the match check uses one). */
    height?: number;
  } = {},
): Promise<RenderedScreen[]> {
  if (!existsSync(RUNTIME)) throw new RenderUnavailable("The preview runtime isn't built.");
  const all = listScreens(buildRouteTree(Object.keys(files))).map((s) => s.screen);
  const targets = options.only?.length ? all.filter((s) => options.only!.includes(s.file)) : all;
  const context = await (
    await getBrowser()
  ).newContext({
    viewport: { width: DEVICE.width, height: options.height ?? DEVICE.height },
    deviceScaleFactor: 2,
  });
  try {
    const tab = await context.newPage();
    await tab.setContent(page(), { waitUntil: "load" });
    const out: RenderedScreen[] = [];
    for (const screen of targets) {
      await tab.evaluate(
        ({ files, href, themeId, storage }) => {
          (window as unknown as { __messages: unknown[] }).__messages = [];
          window.postMessage(
            {
              channel: "appbuilder-preview/v0",
              frameId: "default",
              type: "load",
              files,
              mode: "screen",
              href,
              themeId,
              storage,
            },
            "*",
          );
        },
        {
          files,
          href: canvasHref(screen),
          themeId: options.themeId,
          storage: options.storage ?? {},
        },
      );
      try {
        await tab.waitForFunction(
          () =>
            (window as unknown as { __messages: Array<{ type: string }> }).__messages.some(
              (m) => m.type === "rendered" || m.type === "error",
            ),
          null,
          { timeout: 20_000 },
        );
      } catch {
        out.push({ file: screen.file, png: null, error: "The screen didn't finish rendering." });
        continue;
      }
      const error = await tab.evaluate(() =>
        (window as unknown as { __messages: Array<{ type: string; message?: string }> }).__messages
          .filter((m) => m.type === "error")
          .map((m) => m.message ?? "")
          .join("; "),
      );
      // Let data load and pictures arrive before the screenshot.
      await tab.waitForTimeout(options.settleMs ?? 900);
      const png = await tab.screenshot({ type: "png" });
      out.push({ file: screen.file, png, ...(error ? { error } : {}) });
    }
    return out;
  } finally {
    await context.close();
  }
}

/** Close the shared browser (tests, shutdown). */
export async function closeRenderer(): Promise<void> {
  const current = browser;
  browser = null;
  if (current) await (await current.catch(() => null))?.close();
}
