import { expect, test } from "@playwright/test";
import { E2E_BASE_URL } from "./env";

/**
 * Connectors end to end: Linear and Notion point at a local stand-in MCP + OAuth server
 * (mock-mcp-server.mjs), so signing in, pasting a token and using a connector in the chat all
 * run for real. The worker's model is the offline generator, which answers the connector read
 * with a fixed brief.
 */
test.skip(Boolean(E2E_BASE_URL), "needs the stand-in MCP server the local config starts");

test("connect tools in Settings and use one from the chat", async ({ page }) => {
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Connector User");
  await page.getByLabel("Email").fill(`connectors-${Date.now()}@example.com`);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("credit-balance")).toHaveText("60");

  await page.goto("/settings#connectors");
  const rows = page.getByTestId("connectors");
  await expect(rows.locator(":scope > [data-testid^=connector-]")).toHaveCount(12);
  const linear = page.getByTestId("connector-linear");
  const notion = page.getByTestId("connector-notion");
  await expect(linear.getByTestId("connector-status")).toHaveText("Not connected");
  await expect(page.getByTestId("connector-google-play").getByRole("button")).toHaveText(
    "Not available yet",
  );

  // Notion: sign in (the stand-in approves at once), back on Settings and connected.
  await notion.getByTestId("connector-connect").click();
  await page.waitForURL(/\/settings/);
  await expect(page.getByText("Notion connected")).toBeVisible();
  await expect(notion.getByTestId("connector-status")).toHaveText("Connected");

  // Linear: a pasted API key, checked against the MCP server first.
  await linear.getByRole("button", { name: /Paste a token instead/ }).click();
  await linear.getByLabel("Linear token").fill("lin_api_e2e_wrong_token");
  await linear.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Linear rejected this token.")).toBeVisible();
  await linear.getByLabel("Linear token").fill("lin_api_e2e_good_token");
  await linear.getByRole("button", { name: "Save" }).click();
  await expect(linear.getByTestId("connector-status")).toHaveText("Connected");
  await expect(linear).toContainText("Personal API key");

  // Settings reloads with both connected.
  await page.reload();
  await expect(notion.getByTestId("connector-status")).toHaveText("Connected");
  await expect(linear.getByTestId("connector-status")).toHaveText("Connected");

  // Test opens a session the way builds do and lists the server's tools.
  await notion.getByTestId("connector-test").click();
  await expect(notion.getByTestId("connector-test-result")).toContainText(
    "Works: 2 tools (search_issues, get_issue)",
  );
  await linear.getByTestId("connector-test").click();
  await expect(linear.getByTestId("connector-test-result")).toContainText("Works: 2 tools");

  // A chat change that names Linear reads it first; one that names Mobbin says it isn't connected.
  await page.goto("/");
  await page.getByLabel("Describe your app").fill("A habit tracker");
  await page.getByTestId("prompt-submit").click();
  await page.waitForURL(/\/projects\//);
  await page.getByTestId("confirm-build").click({ timeout: 30_000 });
  await expect(page.getByTestId("status")).toHaveText("Ready", { timeout: 60_000 });
  await page
    .getByLabel("Message the agent")
    .fill("Add a stats tab like my Linear issue ENG-12 describes, using Mobbin references");
  await page.getByTestId("chat-send").click();
  await expect(page.getByText("Read from Linear.")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(/Mobbin isn't connected/)).toBeVisible();

  // Disconnecting removes the connection.
  await page.goto("/settings#connectors");
  await linear.getByRole("button", { name: "Disconnect" }).click();
  await expect(linear.getByTestId("connector-status")).toHaveText("Not connected");
});
