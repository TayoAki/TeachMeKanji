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
  // Saving goes through the inline-edit API and a new version: allow for a loaded machine.
  await expect
    .poll(async () => (await files())["app/settings.tsx"], { timeout: 15_000 })
    .toContain(">HELP</Text>");
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

test("search jumps to a project", async ({ page }) => {
  await signUp(page, "Searcher");
  await page.getByLabel("Describe your app").fill("A plant watering tracker");
  await page.getByTestId("prompt-submit").click();
  await page.waitForURL(/\/projects\//);
  const projectUrl = page.url();
  await expect(page.getByTestId("confirm-build")).toBeVisible({ timeout: 30_000 });
  const name = (await (await page.request.get(`/api/projects`)).json()).projects[0].name as string;

  // The rail's Search button (or Cmd/Ctrl+K) opens a project switcher.
  await page.goto("/");
  await page.getByTestId("rail-search").click();
  const dialog = page.getByRole("dialog", { name: "Search projects" });
  await expect(dialog).toBeVisible();
  await page.keyboard.type(name.slice(0, 4));
  await expect(dialog.getByRole("option", { name: new RegExp(name) })).toBeVisible();
  await page.keyboard.press("Enter");
  await page.waitForURL(projectUrl);

  await page.goto("/");
  // The shortcut works once the page is interactive.
  await expect(async () => {
    await page.keyboard.press("ControlOrMeta+k");
    await expect(dialog).toBeVisible({ timeout: 1_000 });
  }).toPass();
  await page.keyboard.type("no such project zzz");
  await expect(dialog).toContainText("No projects found.");
  await page.keyboard.press("Escape");

  // The sidebar's filter narrows the project list.
  await page.getByPlaceholder("Filter projects").fill(name.slice(0, 4));
  await expect(page.getByTestId("project-list")).toContainText(name);
  await page.getByPlaceholder("Filter projects").fill("no such project zzz");
  await expect(page.getByTestId("project-list")).toContainText("No projects yet.");
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

test("AI features: the app asks its AI through App Cloud, which turns on by itself", async ({
  page,
  request,
}) => {
  await signUp(page, "Asker");
  await createAndBuild(page, "A kanji study app");
  const projectId = page.url().split("/projects/")[1]!;
  expect((await request.post(`/api/app/${projectId}/ai`)).status()).toBe(404);

  // App Cloud turning on gives the preview a session, which reloads the screens once.
  const previewToken = page.waitForResponse((r) => r.url().includes("/preview-token"));
  await page.getByLabel("Message the agent").fill("add an Ask AI tab");
  await page.getByTestId("chat-send").click();
  await expect(page.getByText("App Cloud is now on")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("status")).toHaveText("Ready", { timeout: 30_000 });
  await expect(page.getByTestId("app-cloud-panel")).toContainText("Connected");

  // In the canvas, the new tab asks the AI and shows its answer.
  const ask = page
    .getByTestId("canvas-screen")
    .filter({ hasText: "ask.tsx" })
    .frameLocator("iframe");
  await previewToken;
  await expect(async () => {
    await ask.getByLabel("Question").fill("What does 水 mean?");
    await ask.getByRole("button", { name: "Ask", exact: true }).click();
    await expect(ask.getByText("Offline AI answer to: What does 水 mean?")).toBeVisible({
      timeout: 3_000,
    });
  }).toPass({ timeout: 20_000 });

  // The API needs a session and a question, and the Data tab counts the answers.
  const { token } = (await (await request.post(`/api/app/${projectId}/auth/anonymous`)).json()) as {
    token: string;
  };
  const headers = { authorization: `Bearer ${token}` };
  expect((await request.post(`/api/app/${projectId}/ai`, { data: {} })).status()).toBe(401);
  expect((await request.post(`/api/app/${projectId}/ai`, { headers, data: {} })).status()).toBe(
    400,
  );
  const answer = await request.post(`/api/app/${projectId}/ai`, {
    headers,
    data: { prompt: "hello" },
  });
  expect(await answer.json()).toEqual({ text: "Offline AI answer to: hello" });
  await page.getByTestId("tab-data").click();
  await expect(page.getByTestId("data-ai-calls")).not.toHaveText("0");
});

test("payments: RevenueCat keys by hand, or set up through the RevenueCat connector", async ({
  page,
}) => {
  await signUp(page, "Seller");
  await createAndBuild(page, "A meditation timer");
  const projectId = page.url().split("/projects/")[1]!;
  const files = async () =>
    (
      (await (await page.request.get(`/api/projects/${projectId}`)).json()) as {
        files: Record<string, string>;
      }
    ).files;
  const panel = page.getByTestId("payments-panel");
  await expect(panel.getByTestId("payments-mode")).toHaveText("Test mode");
  // New apps get store identifiers for builds and RevenueCat.
  expect((await files())["app.json"]).toMatch(/"bundleIdentifier": "com\.appbuilder\./);

  // Pasted keys: RevenueCat's public keys only.
  await panel.getByTestId("payments-edit").click();
  await panel.getByLabel("RevenueCat App Store key").fill("sk_secret_key_never_in_an_app");
  await panel.getByTestId("payments-save").click();
  await expect(page.getByText("The App Store key is RevenueCat's public key")).toBeVisible();
  await panel.getByLabel("RevenueCat App Store key").fill("appl_PastedPublicKey123");
  await panel.getByTestId("payments-save").click();
  await expect(panel.getByTestId("payments-mode")).toHaveText("RevenueCat", { timeout: 15_000 });
  expect((await files())["data/payments.ts"]).toContain('"iosApiKey": "appl_PastedPublicKey123"');

  // Through the RevenueCat connector: the setup run writes both keys.
  await page.goto("/settings#connectors");
  const revenuecat = page.getByTestId("connector-revenuecat");
  await revenuecat.getByTestId("connector-connect").click();
  await revenuecat.getByLabel("RevenueCat token").fill("sk_e2e_good_revenuecat_token");
  await revenuecat.getByRole("button", { name: "Save" }).click();
  await expect(revenuecat.getByTestId("connector-status")).toHaveText("Connected");
  await page.goto(`/projects/${projectId}`);
  await page.getByTestId("payments-setup").click();
  await expect(
    page.getByText("Offline mode: pretend products, entitlement and offering."),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(async () => (await files())["data/payments.ts"])
    .toContain('"androidApiKey": "goog_OfflineTestKey1234"');
});

test("store builds: keys are checked before saving, identifiers live in app.json", async ({
  page,
}) => {
  await signUp(page, "Shipper");
  await createAndBuild(page, "A water reminder");
  const projectId = page.url().split("/projects/")[1]!;

  // Store settings: valid identifiers and the App Store Connect app id, saved as a version.
  const store = async () =>
    (await (await page.request.get(`/api/projects/${projectId}/store`)).json()) as {
      settings: { ios: string; android: string; ascAppId: string };
      keys: { expo: boolean; appStore: boolean; play: boolean };
    };
  const before = await store();
  expect(before.settings.ios).toMatch(/^com\.appbuilder\.[a-z0-9]+$/);
  expect(before.keys).toEqual({ expo: false, appStore: false, play: false });
  const put = (data: object) => page.request.put(`/api/projects/${projectId}/store`, { data });
  expect((await put({ ios: "not an id", android: "com.me.water" })).status()).toBe(400);
  expect(
    (await put({ ios: "com.me.water", android: "com.me.water", ascAppId: "abc" })).status(),
  ).toBe(400);
  expect(
    (await put({ ios: "com.me.water", android: "com.me.water", ascAppId: "6741234567" })).status(),
  ).toBe(200);
  expect((await store()).settings).toEqual({
    ios: "com.me.water",
    android: "com.me.water",
    ascAppId: "6741234567",
  });
  const { files } = (await (await page.request.get(`/api/projects/${projectId}`)).json()) as {
    files: Record<string, string>;
  };
  expect(files["app.json"]).toContain('"bundleIdentifier": "com.me.water"');

  // Settings: an incomplete App Store Connect key or Play key is refused before anything is sent.
  await page.goto("/settings#integrations");
  const asc = page.getByTestId("integration-app-store-connect");
  await asc.getByLabel("App Store Connect key ID").fill("ABC123DEFG");
  await asc.getByLabel("App Store Connect issuer ID").fill("57246542-96fe-1a63-e053-0824d011072a");
  await asc.getByLabel("Apple team ID").fill("TEAM123456");
  await asc.getByLabel("App Store Connect private key").fill("not a key");
  await asc.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("Paste the whole .p8 file")).toBeVisible();
  const play = page.getByTestId("integration-play-console");
  await play.getByLabel("Google Play service account key").fill('{"type": "authorized_user"}');
  await play.getByRole("button", { name: "Save key" }).click();
  await expect(page.getByText("That isn't a Google service account key")).toBeVisible();
});

test("store listing: copy within the stores' limits, framed screenshots, one zip", async ({
  page,
}) => {
  await signUp(page, "Lister");
  await createAndBuild(page, "A reading log");
  await page.getByRole("button", { name: "Project menu" }).click();
  await page.getByTestId("open-listing").click();
  await page.getByTestId("listing-write").click();
  const listing = page.getByTestId("listing");
  await expect(listing).toContainText("Track it in seconds", { timeout: 30_000 });
  await expect(listing).toContainText("19/30"); // the subtitle's length against the limit

  // Each screenshot is the real screen, rendered and captured, framed with its caption.
  await page.getByTestId("listing-screenshots").click();
  const shots = page.getByTestId("listing-shots").locator("img");
  await expect(shots).toHaveCount(4, { timeout: 60_000 });
  const size = await shots
    .first()
    .evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]);
  expect(size).toEqual([1290, 2796]);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Download all" }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-store-listing\.zip$/);
});

test("promo video: an editable storyboard, a real render of the app's screens, play and download", async ({
  page,
}) => {
  test.setTimeout(300_000);
  await signUp(page, "Director");
  await createAndBuild(page, "A habit tracker with streaks");
  const projectId = page.url().split("/projects/")[1]!;
  await page.getByRole("button", { name: "Project menu" }).click();
  await page.getByTestId("open-promo").click();
  await page.getByTestId("promo-write").click();

  // The board is the AI's draft, and every word of it is the owner's to change.
  const board = page.getByTestId("promo-board");
  await expect(board.getByTestId("promo-beat")).toHaveCount(3, { timeout: 30_000 });
  await expect(page.getByTestId("promo-hook")).toHaveValue("Your day, sorted in a minute");
  await page.getByTestId("promo-hook").fill("Build habits that stick");
  await page.getByLabel("Caption for screen 1").fill("");
  await expect(board).toContainText("Write a caption for screen 1.");
  await expect(page.getByTestId("promo-render")).toBeDisabled();
  await page.getByLabel("Caption for screen 1").fill("Check in with one tap");

  // Rendering captures the screens from the app's own preview, then films them.
  await page.getByTestId("promo-format-landscape").click();
  await page.getByTestId("promo-render").click();
  await expect(page.getByTestId("promo-progress")).toBeVisible();
  const video = page.getByTestId("promo-video").first();
  await expect(video).toBeVisible({ timeout: 240_000 });
  await expect(page.getByTestId("promo-videos")).toContainText("Build habits that stick");
  await expect(page.getByTestId("promo-videos")).toContainText("Landscape 16:9");
  const duration = await video.evaluate(
    (v: HTMLVideoElement) =>
      new Promise<number>((resolve) => {
        if (v.readyState >= 1) resolve(v.duration);
        else v.addEventListener("loadedmetadata", () => resolve(v.duration), { once: true });
      }),
  );
  expect(duration).toBeGreaterThan(12);

  // The file streams with byte ranges (the player can seek), and only to the project's members.
  const src = (await video.getAttribute("src"))!;
  const ranged = await page.request.get(src, { headers: { Range: "bytes=0-99" } });
  expect(ranged.status()).toBe(206);
  expect(ranged.headers()["content-type"]).toBe("video/mp4");
  expect((await ranged.body()).length).toBe(100);
  const stranger = await page.context().browser()!.newContext();
  expect((await stranger.request.get(new URL(src, page.url()).toString())).status()).toBe(401);
  await stranger.close();
  expect((await page.request.get(`/api/projects/${projectId}/promo/nope/video.mp4`)).status()).toBe(
    404,
  );

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("link", { name: "Download MP4" }).first().click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/-promo-landscape\.mp4$/);
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

  // People can delete their account in the app (Apple 5.1.1(v)); it leaves the owner's list.
  await app.getByText("Delete account").click();
  await app.getByText("Delete my account").click();
  await expect(app.getByText("Sign up to keep your data on all your devices.")).toBeVisible({
    timeout: 15_000,
  });
  await page.reload();
  await page.getByTestId("tab-data").click();
  await expect(page.getByTestId("data-collection-habits")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByTestId("data-accounts")).toHaveCount(0);

  // The app's hosted privacy policy describes what it uses, accounts and deletion included.
  await page.goto(`/apps/${projectId}/privacy`);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Privacy Policy");
  await expect(page.getByText("Your account:")).toBeVisible();
  await expect(page.getByText(/Delete your account and everything saved in it/)).toBeVisible();
  expect((await request.get("/apps/no-such-project/privacy")).status()).toBe(404);
});

test("analytics: preview taps are test events, phones count, and the funnel adds up", async ({
  page,
  request,
}) => {
  await signUp(page, "Counter");
  await createAndBuild(page, "A habit tracker with streaks");
  const projectId = page.url().split("/projects/")[1]!;
  const phone = (install: string, events: Array<Record<string, unknown>>, test = false) =>
    request.post(`/api/app/${projectId}/events`, {
      data: { install, platform: "ios", test, events },
    });

  // Off: there's nowhere to send events.
  expect((await phone("e2e-phone-0001", [{ name: "app_open" }])).status()).toBe(404);

  await page.getByTestId("tab-analytics").click();
  await expect(page.getByTestId("analytics-view")).toContainText("Free · no credits");
  await page.getByTestId("analytics-switch").click();
  await expect(page.getByTestId("bottom-bar")).toContainText("Version 2", { timeout: 15_000 });
  await expect(page.getByTestId("analytics-view")).toContainText("No real users yet");

  // The canvas runs the app: its screens send events, marked as tests.
  await expect(async () => {
    await page.getByRole("tab", { name: "Canvas" }).click();
    await expect(page.locator('iframe[data-frame-id="app"]')).toBeVisible();
    await page.waitForTimeout(5_000);
    await page.getByTestId("tab-analytics").click();
    await expect(page.getByTestId("analytics-test-events")).toContainText(
      "test events in the last 24 hours",
      { timeout: 2_000 },
    );
  }).toPass({ timeout: 45_000 });

  // A real phone: opened, onboarded, saw the paywall, subscribed. Another only opened it.
  expect((await phone("x", [{ name: "app_open" }])).status()).toBe(400);
  const first = await phone("e2e-phone-0002", [
    { name: "app_open" },
    { name: "onboarding_complete" },
    { name: "screen_view", screen: "/paywall" },
    { name: "purchase", props: { offer: "yearly", trial: true } },
    { name: "streak_kept", props: { days: 3 } },
  ]);
  expect(await first.json()).toEqual({ accepted: 5, dropped: 0 });
  await phone("e2e-phone-0003", [{ name: "app_open" }, { name: "screen_view", screen: "/" }]);

  await page.getByRole("tab", { name: "Canvas" }).click();
  await page.getByTestId("tab-analytics").click();
  const view = page.getByTestId("analytics-view");
  await expect(view).toContainText("Users · last 30 days");
  await expect(page.getByTestId("analytics-daily")).toBeVisible();
  const funnel = page.getByTestId("analytics-funnel");
  await expect(funnel).toContainText("Opened the app2 · 100%");
  await expect(funnel).toContainText("Started a trial or subscribed1 · 50%");
  await expect(view).toContainText("streak_kept");
});

test("errors: a phone's error reaches the Errors tab, and Fix with AI fixes it", async ({
  page,
  request,
}) => {
  await signUp(page, "Fixer");
  await createAndBuild(page, "A habit tracker with streaks");
  const projectId = page.url().split("/projects/")[1]!;
  const report = (data: Record<string, unknown>) =>
    request.post(`/api/app/${projectId}/errors`, { data });

  // Every app reports its errors (no App Cloud or analytics needed); malformed reports bounce.
  expect((await report({ install: "x", message: "boom" })).status()).toBe(400);
  const sent = await report({
    install: "e2e-phone-0101",
    message: "Cannot read property 'streak' of undefined",
    stack:
      "TypeError: Cannot read property 'streak' of undefined\n    at StatsScreen (app/(tabs)/stats.tsx:20:12)",
    screen: "/stats",
    platform: "ios",
    test: false,
  });
  expect(await sent.json()).toEqual({ accepted: true });

  await page.getByTestId("tab-errors").click();
  await expect(page.getByTestId("app-error")).toContainText("Cannot read property");
  await expect(page.getByTestId("app-error")).toContainText("iPhone");
  await page.getByTestId("fix-error").click();
  await expect(page.getByTestId("chat-assistant").last()).toContainText(
    "Fixed the reported error",
    { timeout: 60_000 },
  );
  await page.getByTestId("tab-errors").click();
  await expect(page.getByTestId("errors-view")).toContainText("No open errors");
});
