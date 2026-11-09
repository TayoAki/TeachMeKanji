import { expect, test } from "@playwright/test";
import pg from "pg";
import { E2E_BASE_URL, E2E_DATABASE_URL, E2E_PROD } from "./env";

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

async function sql<T extends Record<string, unknown>>(text: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

async function connectFakeAssistant(email: string) {
  const id = `e2e-client-${Date.now()}`;
  await sql(`insert into oauth_client (id, client_id, redirect_uris) values ($1, $1, $2)`, [
    id,
    ["https://assistant.example/cb"],
  ]);
  await sql(
    `insert into oauth_consent (id, client_id, user_id, scopes, created_at, updated_at)
     select $1, $1, id, '{openid}', now(), now() from "user" where email = $2`,
    [id, email],
  );
}

async function consentCount(email: string): Promise<number> {
  const [row] = await sql<{ n: number }>(
    `select count(*)::int as n from oauth_consent c join "user" u on u.id = c.user_id where u.email = $1`,
    [email],
  );
  return row?.n ?? 0;
}

test("forgot password: a reset link sets a new password and signs out every session", async ({
  page,
  browser,
}) => {
  test.skip(Boolean(E2E_BASE_URL), "reads the reset token from the test database");
  test.skip(E2E_PROD, "production here has no email provider, so reset is off (tested below)");
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

  // Someone else connected an assistant to this account (it may have been registered by them).
  await connectFakeAssistant(email);
  expect(await consentCount(email)).toBe(1);

  // The link in the email goes through the auth API, which checks the token and redirects.
  const token = await resetToken(email);
  await other.goto(`/api/auth/reset-password/${token}?callbackURL=%2Freset-password`);
  await expect(other).toHaveURL(/\/reset-password\?token=/);
  await other.getByLabel("New password").fill("second-password-2");
  await other.getByRole("button", { name: "Save password" }).click();
  await expect(other.getByRole("status")).toContainText("Your password was changed");

  // The first browser's session was revoked, and so was every connected AI assistant.
  expect((await page.request.get("/api/me")).status()).toBe(401);
  expect(await consentCount(email)).toBe(0);

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

test("without an email provider in production, password reset is hidden", async ({ page }) => {
  test.skip(!E2E_PROD && !E2E_BASE_URL, "development prints emails, so reset is available");
  await page.goto("/sign-in");
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Forgot password?" })).toHaveCount(0);
  await page.goto("/forgot-password");
  await expect(page.getByText("Password reset isn't available")).toBeVisible();
});

test("invite links: a new person signs up through one and joins; it works only once", async ({
  page,
  browser,
}) => {
  const ownerEmail = `owner-${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Owner");
  await page.getByLabel("Email").fill(ownerEmail);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("credit-balance")).toHaveText("100");
  const projectId = await page.evaluate(async () => {
    const form = new FormData();
    form.set("prompt", "A shared shopping list");
    const res = await fetch("/api/projects", { method: "POST", body: form });
    return ((await res.json()) as { id: string }).id;
  });
  await page.goto(`/projects/${projectId}`);
  await page.getByTestId("open-share").click();
  await page.getByTestId("create-invite").click();
  const inviteUrl = (await page.getByTestId("invite-url").textContent())!.trim();
  expect(inviteUrl).toMatch(/\/invite\/[A-Za-z0-9_-]+$/);

  // A new person: the link sends them to sign in, they create an account, and come back.
  const guest = await (await browser.newContext()).newPage();
  await guest.goto(inviteUrl);
  await expect(guest).toHaveURL(/\/sign-in\?next=/);
  await guest.getByRole("link", { name: "Create an account" }).click();
  await guest.getByLabel("Name").fill("Guest");
  await guest.getByLabel("Email").fill(`guest-${Date.now()}@example.com`);
  await guest.getByLabel("Password").fill("correct-horse-battery");
  await guest.getByRole("button", { name: "Create account" }).click();
  await expect(guest.getByRole("heading", { name: /^Join “/ })).toBeVisible();
  await guest.getByTestId("accept-invite").click();
  await expect(guest).toHaveURL(new RegExp(`/projects/${projectId}$`));
  await guest.getByTestId("open-share").click();
  await expect(guest.getByTestId("member-list")).toContainText("Can edit");

  // The link was used up.
  const third = await (await browser.newContext()).newPage();
  await third.goto("/sign-up");
  await third.getByLabel("Name").fill("Third");
  await third.getByLabel("Email").fill(`third-${Date.now()}@example.com`);
  await third.getByLabel("Password").fill("correct-horse-battery");
  await third.getByRole("button", { name: "Create account" }).click();
  await expect(third.getByTestId("credit-balance")).toHaveText("100");
  await third.goto(inviteUrl);
  await expect(third.getByText("This invite has expired")).toBeVisible();
  const status = await third.evaluate(
    async (id) => (await fetch(`/api/projects/${id}`)).status,
    projectId,
  );
  expect(status).toBe(404);
});
