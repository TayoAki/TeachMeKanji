/**
 * A built app running in the worker's headless Chrome the way people use it in the preview: the
 * preview runtime in "app" mode, interactive, keeping what the app saves. The walkthrough tester
 * looks at it (a screenshot, the controls on screen and the text) and taps, types and scrolls.
 * Relaunching loads the app again with what it saved, like closing and reopening it on a phone.
 */
import type { Page } from "playwright-core";
import type { ProjectFiles } from "@appbuilder/contract";
import { DEVICE, getBrowser, runtimePage } from "../render/screens";

export interface Control {
  /** The number the tester uses to name it. */
  ref: number;
  /** button, tab, checkbox, switch, link, textbox… */
  role: string;
  name: string;
  value?: string;
  checked?: boolean;
  disabled?: boolean;
  /** Below or above the visible part of the screen (tapping scrolls to it). */
  offscreen?: boolean;
}

export interface Observation {
  /** The screen's route, e.g. "/settings". */
  path: string;
  controls: Control[];
  /** The screen's visible text, shortened. */
  text: string;
  /** Errors the app threw since the last observation. */
  errors: string[];
  /** A JPEG screenshot of the phone screen. */
  jpeg: Buffer;
}

interface Posted {
  type: string;
  href?: string;
  key?: string;
  value?: string | null;
  message?: string;
}

const SETTLE_MS = 700;

export class AppSession {
  private path = "/";
  private seen = 0;
  private storage: Record<string, string>;

  private constructor(
    private readonly page: Page,
    private readonly close_: () => Promise<void>,
    private readonly files: ProjectFiles,
    private readonly options: { themeId?: string; storage?: Record<string, string> },
  ) {
    this.storage = { ...(options.storage ?? {}) };
  }

  static async open(
    files: ProjectFiles,
    options: { themeId?: string; storage?: Record<string, string>; settleMs?: number } = {},
  ): Promise<AppSession> {
    const context = await (
      await getBrowser()
    ).newContext({ viewport: DEVICE, deviceScaleFactor: 1 });
    const page = await context.newPage();
    await page.setContent(runtimePage(), { waitUntil: "load" });
    const session = new AppSession(page, () => context.close(), files, options);
    await session.load("/");
    return session;
  }

  /** Close the app and open it again, keeping what it saved (like a phone). */
  async relaunch(): Promise<void> {
    await this.collect();
    await this.load("/");
  }

  async close(): Promise<void> {
    await this.close_().catch(() => {});
  }

  private async load(href: string) {
    await this.page.evaluate(
      ({ files, href, themeId, storage }) => {
        (window as unknown as { __messages: unknown[] }).__messages = [];
        window.postMessage(
          {
            channel: "appbuilder-preview/v0",
            frameId: "default",
            type: "load",
            files,
            mode: "app",
            href,
            themeId,
            storage,
            persistStorage: true,
          },
          "*",
        );
      },
      { files: this.files, href, themeId: this.options.themeId, storage: this.storage },
    );
    this.seen = 0;
    this.path = href;
    await this.page
      .waitForFunction(
        () =>
          (window as unknown as { __messages: Posted[] }).__messages.some(
            (m) => m.type === "rendered" || m.type === "error",
          ),
        null,
        { timeout: 20_000 },
      )
      .catch(() => {});
    await this.page.waitForTimeout(SETTLE_MS);
  }

  /** Read what the app posted since last time: navigation, saved data and errors. */
  private async collect(): Promise<string[]> {
    const posted = await this.page.evaluate(
      (from) => (window as unknown as { __messages: Posted[] }).__messages.slice(from),
      this.seen,
    );
    this.seen += posted.length;
    const errors: string[] = [];
    for (const m of posted) {
      if (m.type === "navigated" && m.href) this.path = m.href;
      if (m.type === "storage" && m.key) {
        if (m.value === null || m.value === undefined) delete this.storage[m.key];
        else this.storage[m.key] = m.value;
      }
      if (m.type === "error" && m.message) errors.push(m.message.slice(0, 500));
    }
    return errors;
  }

  async observe(): Promise<Observation> {
    const errors = await this.collect();
    const { controls, text } = await this.page.evaluate((height) => {
      const selector =
        'a,button,input,textarea,select,[role="button"],[role="link"],[role="tab"],[role="checkbox"],[role="switch"],[role="radio"],[role="menuitem"],[role="slider"],[tabindex="0"]';
      const found: Array<{
        ref: number;
        role: string;
        name: string;
        value?: string;
        checked?: boolean;
        disabled?: boolean;
        offscreen?: boolean;
      }> = [];
      const clean = (s: string | null | undefined) => (s ?? "").replace(/\s+/g, " ").trim();
      let ref = 0;
      document.querySelectorAll("[data-wt]").forEach((el) => el.removeAttribute("data-wt"));
      for (const el of Array.from(document.querySelectorAll<HTMLElement>(selector))) {
        // The outermost control wins: a card's inner text isn't a separate control.
        if (el.parentElement?.closest(selector)) continue;
        const box = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        if (box.width < 2 || box.height < 2 || style.visibility === "hidden") continue;
        if (style.display === "none" || style.pointerEvents === "none") continue;
        const input = el as HTMLInputElement;
        const tag = el.tagName.toLowerCase();
        const role =
          el.getAttribute("role") ||
          (tag === "input" && (input.type === "checkbox" || input.type === "radio")
            ? input.type
            : tag === "input" || tag === "textarea"
              ? "textbox"
              : tag === "a"
                ? "link"
                : "button");
        const name = clean(
          el.getAttribute("aria-label") || el.innerText || el.getAttribute("placeholder"),
        ).slice(0, 80);
        const checkedAttr = el.getAttribute("aria-checked");
        el.setAttribute("data-wt", String(ref));
        found.push({
          ref: ref++,
          role,
          name: name || "(no label)",
          ...(role === "textbox" ? { value: input.value.slice(0, 60) } : {}),
          ...(checkedAttr !== null
            ? { checked: checkedAttr === "true" }
            : role === "checkbox"
              ? { checked: input.checked }
              : {}),
          ...(el.getAttribute("aria-disabled") === "true" || input.disabled
            ? { disabled: true }
            : {}),
          ...(box.bottom < 0 || box.top > height ? { offscreen: true } : {}),
        });
      }
      return { controls: found, text: clean(document.body.innerText).slice(0, 2500) };
    }, DEVICE.height);
    const jpeg = await this.page.screenshot({ type: "jpeg", quality: 70 });
    return { path: this.path, controls, text, errors, jpeg };
  }

  async tap(ref: number): Promise<void> {
    await this.page.click(`[data-wt="${ref}"]`, { force: true, timeout: 5_000 });
    await this.page.waitForTimeout(SETTLE_MS);
  }

  async type(ref: number, text: string): Promise<void> {
    await this.page.fill(`[data-wt="${ref}"]`, text, { force: true, timeout: 5_000 });
    await this.page.waitForTimeout(250);
  }

  async scroll(direction: "up" | "down"): Promise<void> {
    await this.page.mouse.move(DEVICE.width / 2, DEVICE.height / 2);
    await this.page.mouse.wheel(0, direction === "down" ? 600 : -600);
    await this.page.waitForTimeout(400);
  }

  /** Let time pass (an alarm a few seconds away, an animation, data arriving). */
  async wait(seconds: number): Promise<void> {
    await this.page.waitForTimeout(Math.min(15, Math.max(0.5, seconds)) * 1000);
  }
}
