import { expect, test } from "@playwright/test";
import { E2E_ADMIN_TOKEN, E2E_BASE_URL } from "./env";

test.skip(Boolean(E2E_BASE_URL), "needs the admin token the local config sets");

test("an operator grants credits by email with the admin token", async ({ page, request }) => {
  const email = `granted-${Date.now()}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Granted");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("credit-balance")).toHaveText("60");

  const grant = (data: unknown, token?: string) =>
    request.post("/api/admin/credits", {
      data,
      headers: token ? { authorization: `Bearer ${token}` } : {},
    });
  // Without the token (or with a wrong one) the endpoint doesn't exist.
  expect((await grant({ emails: [email], amount: 500 })).status()).toBe(404);
  expect((await grant({ emails: [email], amount: 500 }, "wrong-token")).status()).toBe(404);
  expect((await grant({ emails: [email], amount: 0 }, E2E_ADMIN_TOKEN)).status()).toBe(400);

  const response = await grant(
    { emails: [email, "nobody@example.com"], amount: 500, note: "Testing" },
    E2E_ADMIN_TOKEN,
  );
  expect(response.status()).toBe(200);
  expect(await response.json()).toEqual({
    amount: 500,
    granted: [{ email, balance: 560 }],
    notFound: ["nobody@example.com"],
  });
  await page.reload();
  await expect(page.getByTestId("credit-balance")).toHaveText("560");
});
