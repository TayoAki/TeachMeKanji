import { expect, test, type Page } from "@playwright/test";

/**
 * The product end to end, driven through the UI. The worker runs with the offline template
 * generator (LLM_PROVIDER=fake), so every other part (jobs, validation, versions, credits,
 * preview, export, publishing) is real.
 */

async function signUp(page: Page, name: string, prompt?: string): Promise<string> {
  const email = `${name.toLowerCase().replace(/\W+/g, "")}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto(prompt ? `/sign-up?prompt=${encodeURIComponent(prompt)}` : "/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("credit-balance")).toHaveText("100");
  return email;
}

async function createAndBuild(page: Page, prompt: string) {
  await page.getByLabel("Describe your app").fill(prompt);
  await page.getByTestId("prompt-submit").click();
  await page.waitForURL(/\/projects\//);
  await page.getByTestId("confirm-build").click({ timeout: 30_000 });
  await expect(page.getByTestId("status")).toHaveText("Ready", { timeout: 60_000 });
}

test("from idea to published app", async ({ page, browser }) => {
  // Landing -> sign up keeps the prompt.
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("Build me an expense tracker app with budgets");
  await page.getByTestId("prompt-submit").click();
  await page.waitForURL(/\/sign-up\?prompt=/);
  await page.getByLabel("Name").fill("Jo Builder");
  await page.getByLabel("Email").fill(`jo-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByLabel("Describe your app")).toHaveValue(
    "Build me an expense tracker app with budgets",
  );

  // Prompt -> plan -> revised plan.
  await page.getByTestId("prompt-submit").click();
  await page.waitForURL(/\/projects\//);
  await expect(page.getByTestId("plan-card")).toContainText("Penny Wise", { timeout: 30_000 });
  await page.getByLabel("Message the agent").fill("add a settings screen");
  await page.getByTestId("chat-send").click();
  await expect(page.getByText("Plan 2")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("plan-card").last()).toContainText("Settings");

  // Confirm -> build: every planned screen lands on the canvas and in the live preview.
  await page.getByTestId("confirm-build").click();
  await expect(page.getByTestId("status")).toHaveText("Ready", { timeout: 60_000 });
  // Three main screens plus the four-part structure: onboarding, paywall and settings.
  await expect(page.getByTestId("canvas-screen")).toHaveCount(6);
  await expect(page.getByTestId("plan-card").last()).toContainText("paywall");
  const app = page.frameLocator('iframe[data-frame-id="app"]');
  await expect(app.getByText("Expenses", { exact: true }).first()).toBeVisible();
  await expect(page.getByTestId("bottom-bar")).toContainText("Version 1");
  await expect(page.getByTestId("workspace-credits")).toHaveText("90 credits"); // plan 1 + revise 1 + build 8

  // Navigate inside the app preview.
  await app.getByRole("tab", { name: /Insights/ }).click();
  await expect(page.getByTestId("app-href")).toHaveText("/insights");
  await app.getByRole("tab", { name: /Expenses/ }).click();

  // Chat edit -> new version, live in the preview.
  await page.getByLabel("Message the agent").fill('change "Expenses" to "Spending"');
  await page.getByTestId("chat-send").click();
  await expect(page.getByText("Changed “Expenses” to “Spending”.")).toBeVisible({
    timeout: 30_000,
  });
  await expect(app.getByText("Spending", { exact: true }).first()).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("bottom-bar")).toContainText("Version 2");

  // Instant theme switch, no regeneration; the pick is then saved into the app as a version.
  await page.getByTestId("theme-harbor").click();
  await expect(app.getByText("Spending", { exact: true }).first()).toHaveCSS(
    "color",
    /rgb\(238, 241, 246\)/,
  );
  await expect(page.getByTestId("bottom-bar")).toContainText("Version 3", { timeout: 15_000 });

  // Click-to-edit: change a heading's text and color in the inspector.
  await page.getByTestId("select-toggle").click();
  await app.getByText("Spending", { exact: true }).first().click();
  await page.getByTestId("inspector-text").fill("My spending");
  await page.getByLabel("Text color: accent").click();
  await page.getByTestId("inspector-apply").click();
  await expect(app.getByText("My spending")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("bottom-bar")).toContainText("Version 4");
  await page.getByTestId("select-toggle").click();

  // Computed text is not editable inline; it routes to "Edit with AI".
  await page.getByTestId("select-toggle").click();
  await app.getByText("Total amount").click();
  await expect(page.getByTestId("inspector")).toContainText("comes from data or code");
  await page.getByTestId("inspector-ask-ai").click();
  await expect(page.getByTestId("chat-selection")).toBeVisible();

  // History: restore version 1.
  await page.getByTestId("tab-history").click();
  await page.getByTestId("restore-v1").click();
  await expect(page.getByTestId("bottom-bar")).toContainText("Version 5", { timeout: 15_000 });
  await page.getByRole("tab", { name: "Canvas" }).click();
  await expect(app.getByText("Expenses", { exact: true }).first()).toBeVisible({ timeout: 15_000 });

  // Code tab shows the generated source.
  await page.getByTestId("tab-code").click();
  await expect(page.getByTestId("code-view")).toContainText("useCollection");
  await page.getByRole("tab", { name: "Canvas" }).click();

  // Export: download the Expo project.
  await page.getByTestId("open-export").click();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByTestId("download-zip").click(),
  ]);
  expect(download.suggestedFilename()).toBe("penny-wise.zip");
  await page.keyboard.press("Escape");

  // Phone previews are off on the test server: the dialog says so instead of spinning.
  await page.getByTestId("open-device").click();
  await expect(page.getByTestId("device-dialog")).toContainText("aren't turned on");
  await page.keyboard.press("Escape");

  // Publish to the web and show in the community gallery.
  await page.getByTestId("open-publish").click();
  await page.getByTestId("publish-button").click();
  const url = await page.getByTestId("publish-url").locator("a").getAttribute("href");
  await page.getByLabel("Show in community").click();
  await page.keyboard.press("Escape");

  const visitor = await browser.newPage();
  await visitor.goto(url!);
  await expect(
    visitor
      .frameLocator('iframe[data-frame-id="published"]')
      .getByText("Expenses", { exact: true })
      .first(),
  ).toBeVisible({
    timeout: 15_000,
  });
  await visitor.goto("/community");
  await expect(visitor.getByTestId("community-grid")).toContainText("Penny Wise");
  await visitor.close();
});

test("selecting a screen scopes a chat change to that screen", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Scoped Editor");
  await page.getByLabel("Email").fill(`scoped-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByLabel("Describe your app").fill("An expense tracker");
  await page.getByTestId("prompt-submit").click();
  await page.waitForURL(/\/projects\//);
  await page.getByTestId("confirm-build").click({ timeout: 30_000 });
  await expect(page.getByTestId("status")).toHaveText("Ready", { timeout: 60_000 });
  const projectId = page.url().split("/projects/")[1]!;

  // A press anywhere inside a screen selects it, not only its title.
  const paywall = page.getByTestId("canvas-screen").filter({ hasText: "paywall.tsx" });
  await expect(paywall.frameLocator("iframe").getByText("Restore Purchases")).toBeVisible({
    timeout: 15_000,
  });
  await paywall
    .frameLocator("iframe")
    .locator("body")
    .click({ position: { x: 40, y: 200 } });
  await expect(paywall).toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("chat-selection")).toContainText("Editing: Paywall screen");

  // Pick the Settings screen on the canvas: the chat is now about that screen.
  const settings = page.getByTestId("canvas-screen").filter({ hasText: "settings.tsx" });
  await settings.getByTestId("canvas-screen-title").click();
  await expect(settings).toHaveAttribute("data-selected", "true");
  await expect(paywall).not.toHaveAttribute("data-selected", "true");
  await expect(page.getByTestId("chat-selection")).toContainText("Editing: Settings screen");

  // "Restore Purchases" is on the paywall too; only the selected screen changes.
  await page
    .getByLabel("Message the agent")
    .fill('change "Restore Purchases" to "Restore my plan"');
  await page.getByTestId("chat-send").click();
  await expect(page.getByText("Changed “Restore Purchases” to “Restore my plan”.")).toBeVisible({
    timeout: 30_000,
  });
  const { files } = (await (await page.request.get(`/api/projects/${projectId}`)).json()) as {
    files: Record<string, string>;
  };
  expect(files["app/settings.tsx"]).toContain("Restore my plan");
  expect(files["app/paywall.tsx"]).toContain("Restore Purchases");
  expect(files["app/paywall.tsx"]).not.toContain("Restore my plan");
  await expect(page.getByTestId("chat-selection")).toHaveCount(0);
});

test("themes reach the app, apps follow light or dark, and text edits are free", async ({
  page,
}) => {
  await signUp(page, "Theme Picker");
  await createAndBuild(page, "An expense tracker");
  const projectId = page.url().split("/projects/")[1]!;
  const files = async () =>
    (
      (await (await page.request.get(`/api/projects/${projectId}`)).json()) as {
        files: Record<string, string>;
      }
    ).files;
  expect((await files())["theme/tokens.ts"]).toContain('export const defaultThemeId = "mint";');

  // Picking a theme saves it into the app (phone, export and publish open in it).
  await page.getByTestId("theme-harbor").click();
  await expect
    .poll(async () => (await files())["theme/tokens.ts"], { timeout: 15_000 })
    .toContain('export const defaultThemeId = "harbor";');

  // The app's own Settings has Appearance: Light shows the light partner of Harbor Night.
  const settings = page.getByTestId("canvas-screen").filter({ hasText: "settings.tsx" });
  const frame = settings.frameLocator("iframe");
  const background = () =>
    frame.getByText("APPEARANCE").evaluate((el) => {
      let node: Element | null = el;
      while (node) {
        const color = getComputedStyle(node).backgroundColor;
        if (color && color !== "rgba(0, 0, 0, 0)" && color !== "transparent") return color;
        node = node.parentElement;
      }
      return "";
    });
  const lightness = (rgb: string) =>
    rgb
      .match(/\d+/g)!
      .slice(0, 3)
      .reduce((sum, v) => sum + Number(v), 0) / 3;
  await expect.poll(async () => lightness(await background())).toBeLessThan(100);
  await frame.getByRole("button", { name: "Light" }).click();
  await expect.poll(async () => lightness(await background())).toBeGreaterThan(180);
  await frame.getByRole("button", { name: "Dark" }).click();
  await expect.poll(async () => lightness(await background())).toBeLessThan(100);

  // The workspace's Light / Night switch previews the app in the other mode.
  await frame.getByRole("button", { name: "System" }).click();
  await page.getByTestId("theme-mint").click();
  await expect.poll(async () => lightness(await background())).toBeGreaterThan(180);
  await page.getByTestId("app-appearance-dark").click();
  await expect.poll(async () => lightness(await background())).toBeLessThan(100);
  await page.getByTestId("app-appearance-light").click();
  await expect.poll(async () => lightness(await background())).toBeGreaterThan(180);

  // Double-click text and type over it right on the screen: no AI, no credits.
  const credits = await page.getByTestId("workspace-credits").innerText();
  await frame.getByText("SUPPORT", { exact: true }).dblclick();
  await page.keyboard.type("HELP");
  await page.keyboard.press("Enter");
  await expect.poll(async () => (await files())["app/settings.tsx"]).toContain(">HELP</Text>");
  await expect(frame.getByText("HELP", { exact: true })).toBeVisible();
  await expect(page.getByTestId("workspace-credits")).toHaveText(credits);

  // Escape puts the text back without saving.
  await frame.getByText("HELP", { exact: true }).dblclick();
  await page.keyboard.type("NOPE");
  await page.keyboard.press("Escape");
  await expect(frame.getByText("HELP", { exact: true })).toBeVisible();
  expect((await files())["app/settings.tsx"]).not.toContain("NOPE");

  // Text that comes from data or code opens in the inspector instead.
  await frame.getByText("Free plan").dblclick();
  await expect(page.getByTestId("inspector")).toContainText("comes from data or code");
});

test("the builder switches between night and day", async ({ page }) => {
  await signUp(page, "Night Owl");
  const html = page.locator("html");
  await expect(html).toHaveClass(/\bdark\b/);
  await page.getByTestId("rail-theme").click();
  await expect(html).not.toHaveClass(/\bdark\b/);
  await page.reload();
  await expect(html).not.toHaveClass(/\bdark\b/);
  await page.getByTestId("rail-theme").click();
  await expect(html).toHaveClass(/\bdark\b/);
});

test("sharing and permissions", async ({ browser }) => {
  const owner = await browser.newPage();
  await signUp(owner, "Owner");
  await createAndBuild(owner, "A habit tracker with streaks");
  const projectUrl = owner.url();

  const editor = await browser.newPage();
  const editorEmail = await signUp(editor, "Editor");
  const stranger = await browser.newPage();
  await signUp(stranger, "Stranger");

  // Strangers can't open a private project.
  const response = await stranger.goto(projectUrl);
  expect(response?.status()).toBe(404);

  // Share with the editor, who then sees and can change it.
  await owner.getByTestId("open-share").click();
  await owner.getByLabel("Email to invite").fill(editorEmail);
  await owner.getByRole("button", { name: "Invite", exact: true }).click();
  await expect(owner.getByTestId("member-list")).toContainText(editorEmail);

  await editor.goto("/");
  await editor.getByRole("tab", { name: /Shared with me \(1\)/ }).click();
  await expect(editor.getByTestId("project-grid")).toContainText("Habit Loop");
  await editor.goto(projectUrl);
  await editor.getByLabel("Message the agent").fill('change "Today" to "Daily"');
  await editor.getByTestId("chat-send").click();
  await expect(editor.getByText("Changed “Today” to “Daily”.")).toBeVisible({ timeout: 30_000 });
  // Editors can't publish or delete: those are the owner's.
  await expect(editor.getByTestId("open-publish")).toHaveCount(0);
});

test("free plan limits", async ({ page }) => {
  await signUp(page, "Limits");
  for (const prompt of ["A recipe book", "A workout log"]) {
    await page.getByLabel("Describe your app").fill(prompt);
    await page.getByTestId("prompt-submit").click();
    await page.waitForURL(/\/projects\//);
    await page.goto("/");
  }
  await expect(page.getByText("The Free plan includes 2 projects.")).toBeVisible();
  const status = await page.evaluate(async () => {
    const form = new FormData();
    form.set("prompt", "A third app");
    return (await fetch("/api/projects", { method: "POST", body: form })).status;
  });
  expect(status).toBe(403);
});

test("App Cloud: accounts and per-user data for the generated app", async ({ page, request }) => {
  await signUp(page, "Cloud");
  await createAndBuild(page, "A habit tracker with streaks");
  const projectId = page.url().split("/projects/")[1]!;

  // Without App Cloud the app's API doesn't exist.
  expect((await request.get(`/api/app/${projectId}/collections/habits`)).status()).toBe(404);

  await page.getByTestId("app-cloud-toggle").click();
  await expect(page.getByTestId("app-cloud-panel")).toContainText("Connected", { timeout: 15_000 });
  await expect(page.getByTestId("bottom-bar")).toContainText("Version 2");

  // The API now requires a session; CORS is open for apps running anywhere.
  const anonymous = await request.get(`/api/app/${projectId}/collections/habits`);
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()["access-control-allow-origin"]).toBe("*");
  // Oversized bodies are refused before they're read into memory.
  const oversized = await request.post(`/api/app/${projectId}/auth/sign-in`, {
    data: JSON.stringify({ email: "a@example.com", password: "x".repeat(40_000) }),
    headers: { "content-type": "application/json" },
  });
  expect(oversized.status()).toBe(413);

  // The agent adds sign-in, which uses App Cloud accounts.
  await page.getByLabel("Message the agent").fill("add a sign in screen");
  await page.getByTestId("chat-send").click();
  await expect(page.getByText("Added an Account tab")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("status")).toHaveText("Ready", { timeout: 30_000 });

  // Data loads from the cloud (seeded on first use), and accounts work inside the app.
  const app = page.frameLocator('iframe[data-frame-id="app"]');
  await expect(app.getByText("Drink water")).toBeVisible({ timeout: 15_000 });
  await app.getByRole("tab", { name: /Account/ }).click();
  await app.getByPlaceholder("Email").fill("member@example.com");
  await app.getByPlaceholder("Password").fill("member-password");
  await app.getByText("Create account").click();
  await expect(app.getByText("Signed in as member@example.com")).toBeVisible({ timeout: 15_000 });

  // The owner sees the app's users and records in the Data tab.
  await page.getByTestId("tab-data").click();
  await expect(page.getByTestId("data-accounts")).toContainText("member@example.com");
  await expect(page.getByTestId("data-collection-habits")).not.toHaveText("0");
  await expect(page.getByTestId("data-records")).toContainText("Drink water");
});
