import { expect, test } from "@playwright/test";

/** The public site: positioning, legal pages, and the App Store check funnel. */

test("the landing page leads with cost, links the legal pages, and sign-up states consent", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Build a subscription app without the surprise bill." }),
  ).toBeVisible();
  await expect(page.getByTestId("no-surprises")).toContainText("No overage charges");
  await expect(page.getByTestId("faq")).toContainText("Can I be charged more than my plan?");
  // No empty "community" block when nothing is public yet is checked by its absence of copy.
  await expect(page.getByText("Public apps from the community will show up here.")).toHaveCount(0);

  // The dev server compiles a route on its first visit: wait for the navigation itself.
  await page.getByRole("contentinfo").getByRole("link", { name: "Privacy" }).click();
  await page.waitForURL(/\/privacy$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Privacy Policy" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("AI features and your prompts")).toBeVisible();
  await page.getByRole("contentinfo").getByRole("link", { name: "Terms" }).click();
  await page.waitForURL(/\/terms$/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Terms of Service" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText("There are no overage charges")).toBeVisible();

  await page.goto("/sign-up");
  const consent = page.getByTestId("sign-up-consent");
  await expect(consent).toContainText("By creating an account you agree to the Terms");
  await expect(consent.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute(
    "href",
    "/privacy",
  );
});

test("the App Store check scores the app, shows the fixes, and saves the survey", async ({
  page,
  request,
}) => {
  await page.goto("/check");
  const check = page.getByTestId("store-check");
  const submit = check.getByRole("button", { name: "Check my app" });
  await check
    .getByLabel("Where should we send your results?")
    .fill(`check-${Date.now()}@example.com`);
  await expect(submit).toBeDisabled(); // every question needs an answer
  const questions = await check.getByRole("radiogroup").count();
  expect(questions).toBe(10);
  for (const group of await check.getByRole("radiogroup").all())
    await group.getByRole("radio", { name: "Yes" }).click();
  await check.getByTestId("check-restore-no").click();
  await check.getByTestId("check-legal-links-unsure").click();
  await check.getByTestId("check-nurture").check();
  await submit.click();

  const results = page.getByTestId("check-results");
  await expect(results.getByTestId("check-score")).toHaveText("8 of 10 passed");
  await expect(results).toContainText(
    "Put Restore Purchases on the paywall and again in Settings.",
  );
  await expect(results).toContainText("Terms of Use and Privacy Policy");

  const survey = page.getByTestId("lead-survey");
  await survey.getByRole("button", { name: "Building it now" }).click();
  await survey.getByRole("button", { name: "Getting it into the App Store" }).click();
  await survey.getByRole("button", { name: "Vibecode" }).click();
  await survey
    .getByLabel("What would make this a win")
    .fill("A TestFlight build my friends can try");
  await survey.getByRole("button", { name: "Send" }).click();
  await expect(page.getByTestId("survey-done")).toBeVisible();

  // Bots filling the hidden field get a quiet OK and no lead; bad input is refused.
  const bot = await request.post("/api/leads", {
    data: { email: "bot@example.com", answers: {}, website: "spam" },
  });
  expect(await bot.json()).toEqual({ ok: true });
  expect(
    (await request.post("/api/leads", { data: { email: "nope", answers: {} } })).status(),
  ).toBe(400);
});

test("unsubscribing from the launch emails", async ({ page, request }) => {
  const answers = Object.fromEntries(
    [
      "price-period",
      "trial-terms",
      "auto-renew",
      "legal-links",
      "restore",
      "close",
      "privacy-url",
      "account-deletion",
      "login",
      "screenshots",
    ].map((id) => [id, "yes"]),
  );
  const created = await request.post("/api/leads", {
    data: { email: `unsub-${Date.now()}@example.com`, answers, nurture: true },
  });
  const { token } = (await created.json()) as { token: string };
  await page.goto(`/unsubscribe?t=${token}`);
  await page.getByRole("button", { name: "Unsubscribe" }).click();
  await expect(page.getByTestId("unsubscribed")).toBeVisible();
  // Mail clients' one-click unsubscribe posts to the API with the token in the query.
  const oneClick = await request.post(`/api/leads/unsubscribe?t=${token}`);
  expect(await oneClick.json()).toEqual({ ok: true });
});
