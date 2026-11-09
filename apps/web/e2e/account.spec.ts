import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_BASE_URL, E2E_DATABASE_URL } from "./env";

/** The emailed reset link carries a token; tests have no inbox, so read it from the database. */
async function resetToken(email: string): Promise<string> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    const { rows } = await client.query<{ identifier: string }>(
      `select v.identifier from verification v join "user" u on u.id = v.value
       where u.email = $1 and v.identifier like 'reset-password:%'
       order by v.created_at desc limit 1`,
      [email],
    );
    return rows[0]!.identifier.slice("reset-password:".length);
  } finally {
    await client.end();
  }
}

test("forgot password: a reset link sets a new password and signs out every session", async ({
  page,
  browser,
}) => {
  test.skip(Boolean(E2E_BASE_URL), "reads the reset token from the test database");
  const email = `reset-${Date.now()}@example.com`;
  // In dev, a page's first compile can trigger a reload that wipes a half-filled form.
  for (const path of ["/forgot-password", "/reset-password?token=warm-up"]) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
  }
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Reset");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("first-password-1");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("credit-balance")).toHaveText("100");

  const other = await (await browser.newContext()).newPage();
  await other.goto("/sign-in");
  await other.getByRole("link", { name: "Forgot password?" }).click();
  await expect(async () => {
    await other.getByLabel("Email").fill(email);
    await other.getByRole("button", { name: "Send reset link" }).click();
    await expect(other.getByTestId("reset-sent")).toBeVisible({ timeout: 3_000 });
  }).toPass({ timeout: 30_000 });

  // The link in the email goes through the auth API, which checks the token and redirects.
  const token = await resetToken(email);
  await other.goto(`/api/auth/reset-password/${token}?callbackURL=%2Freset-password`);
  await expect(other).toHaveURL(/\/reset-password\?token=/);
  await other.getByLabel("New password").fill("second-password-2");
  await other.getByRole("button", { name: "Save password" }).click();
  await expect(other.getByRole("status")).toContainText("Your password was changed");

  // The first browser's session was revoked.
  expect((await page.request.get("/api/me")).status()).toBe(401);

  // Only the new password works.
  await other.getByLabel("Email").fill(email);
  await other.getByLabel("Password").fill("first-password-1");
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other.getByRole("alert")).toBeVisible();
  await other.getByLabel("Password").fill("second-password-2");
  await other.getByRole("button", { name: "Sign in" }).click();
  await expect(other.getByTestId("credit-balance")).toHaveText("100");

  // A used link doesn't work twice.
  await other.goto(`/api/auth/reset-password/${token}?callbackURL=%2Freset-password`);
  await expect(other.getByText("This link has expired")).toBeVisible();
});
