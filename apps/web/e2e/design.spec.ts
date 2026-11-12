import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_BASE_URL, E2E_DATABASE_URL } from "./env";

/**
 * Design first: after the plan, the builder draws a mockup of every screen and a mascot (the
 * offline image generator here), the user approves them or asks for a change, and the build
 * follows the approved mockups, with the mascot's poses added to the app as images.
 */

async function signUp(page: Page) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Designer");
  await page
    .getByLabel("Email")
    .fill(`designer-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("credit-balance")).toHaveText("60");
}

async function appImageCount(projectId: string): Promise<number> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ n: number }>(
      "select count(*)::int as n from project_asset where project_id = $1 and purpose = 'app_image'",
      [projectId],
    );
    return rows[0]!.n;
  } finally {
    await client.end();
  }
}

test("design first: mockups and a mascot, a redraw from a note, then a build that follows them", async ({
  page,
}) => {
  await signUp(page);
  await page.getByLabel("Describe your app").fill("A water tracker with a friendly mascot");
  await page.getByTestId("prompt-submit").click();
  await page.waitForURL(/\/projects\//);
  const projectId = page.url().split("/projects/")[1]!;

  // The plan offers mockups first; building straight away is still one click away.
  await expect(page.getByTestId("plan-card")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("confirm-build")).toHaveText(/Skip mockups/);
  await page.getByTestId("design-screens").click();

  const review = page.getByTestId("design-review");
  await expect(review).toBeVisible();
  await expect(page.getByTestId("design-status")).toContainText("Approve each screen", {
    timeout: 60_000,
  });
  const cards = page.getByTestId("design-card");
  const count = await cards.count();
  expect(count).toBeGreaterThanOrEqual(4);
  await expect(cards.locator("img")).toHaveCount(count);
  await expect(page.getByTestId("mascot-card").locator("img")).toHaveCount(3);
  await expect(page.getByTestId("plan-card")).toContainText("Review the mockups on the canvas");

  const first = cards.first();
  await first.getByTestId("design-approve").click();
  await expect(first.getByTestId("design-item-status")).toHaveText("Approved");

  // A change request redraws just that screen; it then needs approving again.
  const second = cards.nth(1);
  const before = await second.locator("img").getAttribute("src");
  await second.getByTestId("design-change").click();
  await second.getByTestId("design-note").fill("Make the header bigger and warmer");
  await second.getByTestId("design-redo").click();
  await expect
    .poll(() => second.locator("img").getAttribute("src"), { timeout: 30_000 })
    .not.toBe(before);
  expect(await second.locator("img").getAttribute("src")).toMatch(/-v2\.png$/);
  await expect(second.getByTestId("design-item-status")).toHaveText("To review");

  // Approve the rest and build: the canvas switches to the built app.
  await page.getByTestId("design-approve-all").click();
  await expect(page.getByTestId("status")).toHaveText("Ready", { timeout: 60_000 });
  await expect(page.getByTestId("canvas-screen").first()).toBeVisible();
  await expect(review).toHaveCount(0);
  // The worker rendered every screen and checked it against its mockup.
  await expect(page.getByText(/Checked against your mockups: .*\d+%/)).toBeVisible();
  // plan 1 + design 10 + one redraw 1 + build 8
  await expect(page.getByTestId("workspace-credits")).toHaveText("40 credits");

  // The mascot's poses were added to the app as images it can show.
  if (!E2E_BASE_URL) expect(await appImageCount(projectId)).toBe(3);
});
