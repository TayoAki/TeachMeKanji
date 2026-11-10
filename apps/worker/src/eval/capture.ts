/**
 * Capture what a user sees of an app: sign in to the builder, open the project's canvas and
 * screenshot every screen (default theme, then the first dark theme for the key screens), and
 * note any screen that fails to render. Works against a local or deployed web app.
 */
import { chromium, request, type APIRequestContext } from "@playwright/test";
import type { AppPlan, ProjectFiles } from "@appbuilder/contract";
import type { Shot } from "./judge";

export type { Shot };

export interface Capture {
  appName: string;
  versionNumber: number | null;
  files: ProjectFiles;
  plan: AppPlan | null;
  shots: Shot[];
  renderErrors: string[];
  /** The signed-in session, for follow-up API calls (see apiSession). */
  storageState: Awaited<ReturnType<APIRequestContext["storageState"]>>;
}

export async function captureProject(options: {
  baseUrl: string;
  email: string;
  password: string;
  projectId: string;
}): Promise<Capture> {
  const proxy = process.env.HTTPS_PROXY;
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(options.baseUrl);
  const browser = await chromium.launch(proxy && !local ? { proxy: { server: proxy } } : {});
  try {
    const page = await browser.newPage({
      viewport: { width: 3400, height: 1100 },
      deviceScaleFactor: 2,
    });
    await page.goto(`${options.baseUrl}/sign-in`);
    await page.getByLabel("Email").fill(options.email);
    await page.getByLabel("Password").fill(options.password);
    await page.getByRole("button", { name: "Sign in" }).click();
    await page.getByTestId("credit-balance").waitFor({ timeout: 30_000 });

    const state = (await page.evaluate(
      async (id) => (await fetch(`/api/projects/${id}`)).json(),
      options.projectId,
    )) as {
      project: { name: string };
      versionNumber: number | null;
      files: ProjectFiles;
      plan: { data: AppPlan } | null;
    };

    await page.goto(`${options.baseUrl}/projects/${options.projectId}`);
    const screens = page.getByTestId("canvas-screen");
    await screens.first().waitFor({ timeout: 60_000 });
    // Every frame renders on its own; give them time (and the fonts) to settle.
    await page.waitForTimeout(8_000);

    const shots: Shot[] = [];
    const renderErrors: string[] = [];
    const count = await screens.count();
    const labels: string[] = [];
    for (let i = 0; i < count; i++) {
      const screen = screens.nth(i);
      const label = ((await screen.locator("button").first().innerText()) || `Screen ${i + 1}`)
        .replace(/\s+/g, " ")
        .trim();
      labels.push(label);
      const failed = await screen
        .frameLocator("iframe")
        .getByText("This screen failed to render")
        .count()
        .catch(() => 0);
      if (failed) renderErrors.push(label);
      shots.push({ label, theme: "default", png: await screen.screenshot() });
    }

    // Key screens again in a dark theme: contrast problems show up there.
    const dark = state.plan?.data.themes.find((t) => t.dark);
    const themeButton = dark ? page.getByTestId(`theme-${dark.id}`) : null;
    if (dark && themeButton && (await themeButton.count())) {
      await themeButton.click();
      await page.waitForTimeout(2_500);
      for (let i = 0; i < count; i++) {
        const label = labels[i]!;
        if (!/index\.tsx|paywall|onboarding/.test(label)) continue;
        shots.push({ label, theme: dark.name, png: await screens.nth(i).screenshot() });
      }
    }

    return {
      storageState: await page.context().storageState(),
      appName: state.project.name,
      versionNumber: state.versionNumber,
      files: state.files,
      plan: state.plan?.data ?? null,
      shots,
      renderErrors,
    };
  } finally {
    await browser.close();
  }
}

/** One image of every screenshot side by side, for the report. */
export async function contactSheet(shots: Shot[]): Promise<Buffer> {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 400, height: 400 } });
    const cells = shots
      .map(
        (s) =>
          `<figure><img src="data:image/png;base64,${s.png.toString("base64")}"/><figcaption>${escapeHtml(
            s.theme === "default" ? s.label : `${s.label} (${s.theme})`,
          )}</figcaption></figure>`,
      )
      .join("");
    await page.setContent(
      `<html><body style="margin:0;background:#f4f4f5;font:12px system-ui"><div style="display:flex;gap:16px;padding:16px;width:max-content">${cells}</div>
      <style>figure{margin:0;width:215px}img{width:215px;display:block;border-radius:8px}figcaption{margin-top:4px;color:#555}</style></body></html>`,
    );
    return await page.screenshot({ fullPage: true });
  } finally {
    await browser.close();
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"]/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!,
  );
}

/** An API client signed in as the captured session (through the proxy when there is one). */
export function apiSession(baseUrl: string, storageState: Capture["storageState"]) {
  const proxy = process.env.HTTPS_PROXY;
  const local = /^https?:\/\/(localhost|127\.0\.0\.1)/.test(baseUrl);
  return request.newContext({
    baseURL: baseUrl,
    storageState,
    ...(proxy && !local ? { proxy: { server: proxy } } : {}),
  });
}
