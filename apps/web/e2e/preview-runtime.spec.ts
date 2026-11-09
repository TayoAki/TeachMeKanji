import { expect, test, type FrameLocator, type Page } from "@playwright/test";

/** Spike A: the preview runtime renders the fixture app and is interactive and isolated. */

const app = (page: Page): FrameLocator => page.frameLocator('iframe[data-frame-id="app"]');
const canvas = (page: Page, id: string): FrameLocator =>
  page.frameLocator(`iframe[data-frame-id="${id}"]`);

test.beforeEach(async ({ page }) => {
  await page.goto("/spikes/preview");
  const log = page.getByTestId("event-log");
  for (const frame of ["app", "today", "progress", "detail", "add"]) {
    await expect(log).toContainText(`[${frame}] rendered`, { timeout: 30_000 });
  }
  await expect(page.getByTestId("event-log")).not.toContainText("ERROR");
});

test("renders every screen of the fixture with seed data", async ({ page }) => {
  await expect(app(page).getByText("2 of 4 habits done")).toBeVisible();
  await expect(canvas(page, "progress").getByText("8 check-ins")).toBeVisible();
  await expect(canvas(page, "detail").getByText("Goal: 7 times a week")).toBeVisible();
  // Title set from inside the screen with <Stack.Screen options={{ title }} />
  await expect(canvas(page, "add").getByText("New habit", { exact: true })).toBeVisible();
});

test("navigates tabs, stack screens and back in app mode", async ({ page }) => {
  const href = page.getByTestId("app-href");
  await app(page)
    .getByRole("tab", { name: /Progress/ })
    .click();
  await expect(href).toHaveText("/stats");
  await expect(app(page).getByText("8 check-ins")).toBeVisible();

  await app(page).getByRole("tab", { name: /Today/ }).click();
  await expect(href).toHaveText("/");

  await app(page).getByText("Morning run").click();
  await expect(href).toHaveText("/habit/h2");
  await expect(app(page).getByText("Goal: 4 times a week")).toBeVisible();

  await app(page).getByLabel("Back").click();
  await expect(href).toHaveText("/");
});

test("reads and writes through the generated app's data layer", async ({ page }) => {
  await app(page).getByRole("checkbox").nth(1).click(); // check "Morning run"
  await expect(app(page).getByText("3 of 4 habits done")).toBeVisible();

  await app(page).getByLabel("Add habit").click();
  await expect(page.getByTestId("app-href")).toHaveText("/add-habit");
  await app(page).getByPlaceholder("e.g. Stretch for 10 minutes").fill("Stretch");
  await app(page).getByText("Save habit").click();
  await expect(page.getByTestId("app-href")).toHaveText("/");
  await expect(app(page).getByText("3 of 5 habits done")).toBeVisible();
  await expect(app(page).getByText("Stretch")).toBeVisible();
});

test("switches theme instantly in every frame without reloading", async ({ page }) => {
  const heading = (frame: FrameLocator) => frame.getByText("Today", { exact: true }).first();
  const before = await heading(app(page)).evaluate((el) => getComputedStyle(el).color);

  await page.getByTestId("theme-select").selectOption("harbor-night");
  await expect
    .poll(() => heading(app(page)).evaluate((el) => getComputedStyle(el).color))
    .not.toBe(before);
  // Harbor Night text color is #E9EEF8
  await expect(heading(app(page))).toHaveCSS("color", "rgb(233, 238, 248)");
  await expect(heading(canvas(page, "today"))).toHaveCSS("color", "rgb(233, 238, 248)");
  // No reload happened: no second "rendered" event for the app frame.
  await expect(page.getByTestId("event-log").getByText("[app] rendered")).toHaveCount(1);
});

test("click-to-select resolves an element to its exact source", async ({ page }) => {
  await page.getByTestId("select-toggle").click();
  await app(page).getByText("2 of 4 habits done").click();

  await expect(page.getByTestId("selected-fid")).toContainText("app/(tabs)/index.tsx:");
  await expect(page.getByTestId("selected-text")).toHaveText("2 of 4 habits done");
  await expect(page.getByTestId("selected-source")).toContainText(
    "{doneToday} of {habits.items.length} habits done",
  );
  // Select mode swallows input: the app did not navigate or toggle anything.
  await expect(page.getByTestId("app-href")).toHaveText("/");
});

test("canvas frames ask the parent to navigate instead of navigating", async ({ page }) => {
  await canvas(page, "today")
    .getByRole("tab", { name: /Progress/ })
    .click();
  await expect(page.getByTestId("event-log")).toContainText("[today] requested navigate /stats");
  await expect(canvas(page, "today").getByText("2 of 4 habits done")).toBeVisible();
});

test("generated code is isolated from the workspace", async ({ page }) => {
  const frame = page.frames().find((f) => f.url().includes("#frame=app"))!;
  const probe = await frame.evaluate(() => {
    const result: Record<string, string> = {};
    try {
      result.parent = String(window.parent.document.cookie);
    } catch (e) {
      result.parent = (e as Error).name;
    }
    try {
      result.cookie = document.cookie;
    } catch (e) {
      result.cookie = (e as Error).name;
    }
    try {
      localStorage.setItem("x", "1");
      result.storage = "allowed";
    } catch (e) {
      result.storage = (e as Error).name;
    }
    result.origin = String(window.origin);
    return result;
  });
  expect(probe.parent).toBe("SecurityError");
  expect(probe.cookie).toBe("SecurityError");
  expect(probe.storage).toBe("SecurityError");
  expect(probe.origin).toBe("null");
});
