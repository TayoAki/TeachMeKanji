import { expect, test, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_BASE_URL, E2E_DATABASE_URL, E2E_FEEDBACK_ADMIN } from "./env";

// A 1×1 PNG, as a screenshot attachment.
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function sql(text: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    await client.query(text, values);
  } finally {
    await client.end();
  }
}

async function signUp(page: Page, name: string, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("credit-balance")).toBeVisible({ timeout: 30_000 });
}

test("bug reports: sent from anywhere with a screenshot, triaged by the operator, answered in Settings", async ({
  page,
  browser,
}) => {
  // The operator's account is reset through the database, which the Docker stack doesn't expose.
  test.skip(Boolean(E2E_BASE_URL), "needs the test database");
  const email = `reporter-${Date.now()}@example.com`;
  await signUp(page, "Reporter", email);
  const title = `The canvas goes blank ${Date.now()}`;

  // The rail opens the dialog on any page; the details say what's attached.
  await page.getByTestId("rail-feedback").click();
  const dialog = page.getByTestId("feedback-dialog");
  await expect(dialog).toContainText("Include technical details");
  await page.getByTestId("feedback-kind-bug").click();
  await page.getByTestId("feedback-title").fill(title);
  await page
    .getByTestId("feedback-body")
    .fill("I zoomed out on the canvas and every screen went blank until I reloaded.");
  await page
    .getByTestId("feedback-images")
    .setInputFiles({ name: "blank.png", mimeType: "image/png", buffer: PNG });
  await expect(dialog.locator("img")).toHaveCount(1);
  await page.getByTestId("feedback-send").click();
  await expect(page.getByText("Thanks, we've got it.")).toBeVisible();

  // The sender follows it in Settings.
  await page.goto("/settings#feedback");
  const mine = page.getByTestId("feedback-list");
  await expect(mine).toContainText(title);
  await expect(mine.getByTestId("feedback-status").first()).toHaveText("New");

  // Only the operator can triage: everyone else gets a plain 404.
  expect((await page.goto("/admin/feedback"))?.status()).toBe(404);
  expect((await page.request.get("/api/admin/feedback")).status()).toBe(404);

  await sql(`delete from "user" where email = $1`, [E2E_FEEDBACK_ADMIN]);
  const operator = await browser.newContext();
  const admin = await operator.newPage();
  await signUp(admin, "Operator", E2E_FEEDBACK_ADMIN);
  await admin.goto("/admin/feedback");
  const item = admin.getByTestId("admin-item").filter({ hasText: title });
  await expect(item).toContainText(email);
  await expect(item).toContainText("I zoomed out on the canvas");
  const shot = item.getByRole("img", { name: "Screenshot 1" });
  await expect(shot).toBeVisible();
  const src = (await shot.getAttribute("src"))!;
  const served = await admin.request.get(src);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");
  await expect.poll(() => shot.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(1);
  // The sender can see their own screenshot; nobody else can.
  expect((await page.request.get(src)).status()).toBe(200);
  const outsider = await browser.newContext();
  expect((await outsider.request.get(new URL(src, page.url()).toString())).status()).toBe(401);
  await outsider.close();
  await item.getByText("Technical details").click();
  await expect(item).toContainText("Window");
  await expect(item).toContainText("Browser");
  await item.getByLabel(`Status of ${title}`).selectOption("planned");
  await item.getByLabel(`Reply to ${title}`).fill("Thanks! We can reproduce it and it's next up.");
  await item.getByRole("button", { name: "Save" }).click();
  await expect(item.getByTestId("feedback-status")).toHaveText("Planned");
  await operator.close();

  // The sender sees the new status and the reply.
  await page.goto("/settings#feedback");
  await expect(mine.getByTestId("feedback-status").first()).toHaveText("Planned");
  await expect(mine.getByTestId("feedback-reply")).toContainText("it's next up");
});
