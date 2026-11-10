import { createHash, randomBytes } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_BASE_URL, E2E_DATABASE_URL } from "./env";

/**
 * An AI assistant (any MCP client) connects with OAuth, exactly as Claude or ChatGPT would:
 * it registers itself, the user signs in and approves it, it exchanges the code (PKCE) for an
 * access token bound to /api/mcp, and then builds an app through the MCP tools.
 */

const ORIGIN = "http://localhost:3000";
const MCP = `${ORIGIN}/api/mcp`;
const REDIRECT = `${ORIGIN}/oauth-test/callback`;
const FIXTURE = join(__dirname, "../../../fixtures/habit-tracker");

const b64url = (buf: Buffer) => buf.toString("base64url");

async function sql<T extends Record<string, unknown>>(text: string, values: unknown[] = []) {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query<T>(text, values)).rows;
  } finally {
    await client.end();
  }
}

async function signUp(page: Page, plan: "free" | "pro") {
  const email = `mcp-${plan}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.com`;
  await page.goto("/sign-up");
  await page.getByLabel("Name").fill("Assistant user");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByTestId("credit-balance")).toHaveText("100");
  if (plan !== "free") {
    await sql(
      `insert into subscription (user_id, plan, status)
       select id, $2, 'active' from "user" where email = $1
       on conflict (user_id) do update set plan = $2, status = 'active'`,
      [email, plan],
    );
  }
  return email;
}

/** Register (RFC 7591), authorize in the browser (consent), and exchange the code (PKCE). */
async function connect(page: Page, request: APIRequestContext, signInAs?: string): Promise<string> {
  const registration = await request.post("/api/auth/oauth2/register", {
    data: {
      client_name: "Test Assistant",
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
  });
  expect(registration.status()).toBeLessThan(300);
  const { client_id } = (await registration.json()) as { client_id: string };

  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const authorize = new URL("/api/auth/oauth2/authorize", ORIGIN);
  for (const [k, v] of Object.entries({
    response_type: "code",
    client_id,
    redirect_uri: REDIRECT,
    scope: "openid offline_access",
    state: "state-123",
    code_challenge: challenge,
    code_challenge_method: "S256",
    resource: MCP,
  }))
    authorize.searchParams.set(k, v);

  await page.goto(authorize.toString());
  if (signInAs) {
    // Signed out: the request waits on the sign-in page and continues to consent afterwards.
    await expect(page).toHaveURL(/\/sign-in\?/);
    await page.getByLabel("Email").fill(signInAs);
    await page.getByLabel("Password").fill("correct-horse-battery");
    await page.getByRole("button", { name: "Sign in" }).click();
  }
  await expect(page.getByTestId("consent-title")).toContainText("Test Assistant");
  // A self-registered client picks its own name, so the page shows where approval really goes.
  await expect(page.getByTestId("consent-identity")).toContainText("chosen by the app itself");
  await expect(page.getByTestId("consent-destination")).toHaveText("localhost:3000");
  const redirected = page.waitForURL((url) => url.href.startsWith(REDIRECT));
  await page.getByTestId("consent-allow").click();
  await redirected;
  const callback = new URL(page.url());
  expect(callback.searchParams.get("state")).toBe("state-123");
  const code = callback.searchParams.get("code")!;

  const token = await request.post("/api/auth/oauth2/token", {
    form: {
      grant_type: "authorization_code",
      code,
      redirect_uri: REDIRECT,
      client_id,
      code_verifier: verifier,
      resource: MCP,
    },
  });
  expect(token.status()).toBe(200);
  return ((await token.json()) as { access_token: string }).access_token;
}

type RpcBody = {
  result: { tools?: Array<{ name: string }>; content?: Array<{ text: string }>; isError?: boolean };
  error?: { message: string };
};

let nextId = 1;
async function rpc(
  request: APIRequestContext,
  token: string,
  method: string,
  params: Record<string, unknown> = {},
) {
  const response = await request.post("/api/mcp", {
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json, text/event-stream",
      "mcp-protocol-version": "2025-06-18",
    },
    data: { jsonrpc: "2.0", id: nextId++, method, params },
  });
  const text = await response.text();
  const body = text.trimStart().startsWith("{")
    ? text
    : text
        .split("\n")
        .find((line) => line.startsWith("data: "))!
        .slice(6);
  return { status: response.status(), body: JSON.parse(body) as RpcBody };
}

async function callTool(
  request: APIRequestContext,
  token: string,
  name: string,
  args: Record<string, unknown>,
) {
  const { body } = await rpc(request, token, "tools/call", { name, arguments: args });
  return {
    text: (body.result.content ?? []).map((c) => c.text).join("\n"),
    isError: Boolean(body.result.isError),
  };
}

async function fixtureFiles(): Promise<Array<{ path: string; content: string }>> {
  const out: Array<{ path: string; content: string }> = [];
  async function walk(dir: string) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else out.push({ path: relative(FIXTURE, full), content: await readFile(full, "utf8") });
    }
  }
  await walk(FIXTURE);
  return out;
}

test.skip(Boolean(E2E_BASE_URL), "sets the test user's plan in the test database");

test("an AI assistant connects over MCP and builds an app", async ({ page, request }) => {
  await signUp(page, "pro");

  // Unauthenticated calls are told where to sign in (RFC 9728).
  const anonymous = await request.post("/api/mcp", {
    data: { jsonrpc: "2.0", id: 0, method: "tools/list" },
  });
  expect(anonymous.status()).toBe(401);
  expect(anonymous.headers()["www-authenticate"]).toContain(
    "/.well-known/oauth-protected-resource/api/mcp",
  );
  const prm = await (await request.get("/.well-known/oauth-protected-resource/api/mcp")).json();
  expect(prm).toMatchObject({ resource: MCP, authorization_servers: [`${ORIGIN}/api/auth`] });

  const token = await connect(page, request);

  const init = await rpc(request, token, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1.0.0" },
  });
  expect(init.status).toBe(200);
  const tools = await rpc(request, token, "tools/list");
  const names = (tools.body.result.tools ?? []).map((t) => t.name);
  expect(names).toEqual(
    expect.arrayContaining(["create_project", "get_app_rules", "write_files", "get_preview_link"]),
  );

  const created = await callTool(request, token, "create_project", {
    name: "Habit Loop",
    description: "A habit tracker with streaks",
  });
  const projectId = /\(id (p_[A-Za-z0-9_-]+)\)/.exec(created.text)![1]!;

  const rules = await callTool(request, token, "get_app_rules", { project_id: projectId });
  expect(rules.text).toContain("Rules");
  expect(rules.text).toContain("theme/types.ts");

  // Code that breaks the contract is refused with the problems, and nothing is saved.
  const files = await fixtureFiles();
  const broken = files.map((f) =>
    f.path === "app/(tabs)/index.tsx"
      ? { ...f, content: `import axios from "axios";\n${f.content}` }
      : f,
  );
  const refused = await callTool(request, token, "write_files", {
    project_id: projectId,
    files: [...broken, { path: "data/backend.ts", content: "export const backend = {};" }],
    summary: "First version",
  });
  expect(refused.isError).toBe(true);
  expect(refused.text).toContain("Nothing was saved");
  expect(refused.text).toContain("axios");
  expect(refused.text).toContain("REJECTED data/backend.ts");

  const saved = await callTool(request, token, "write_files", {
    project_id: projectId,
    files,
    summary: "First version of Habit Loop",
  });
  expect(saved.isError, saved.text).toBe(false);
  expect(saved.text).toContain("Saved version 1");

  // The user sees it in the workspace, running, with the assistant's note in the chat.
  await page.goto(`/projects/${projectId}`);
  await expect(page.getByText("First version of Habit Loop (from Test Assistant)")).toBeVisible();
  const app = page.frameLocator('iframe[data-frame-id="app"]');
  await expect(app.getByText("Drink water").first()).toBeVisible({ timeout: 20_000 });

  // A later write shows up in an open workspace without reloading.
  const seed = files.find((f) => f.path === "data/seed.ts")!;
  const edited = await callTool(request, token, "write_files", {
    project_id: projectId,
    files: [{ path: "data/seed.ts", content: seed.content.replace("Drink water", "Drink tea") }],
    summary: "Rename a habit",
  });
  expect(edited.isError, edited.text).toBe(false);
  await expect(app.getByText("Drink tea").first()).toBeVisible({ timeout: 20_000 });

  // Images: an assistant adds one it made (here as base64; ChatGPT passes a file reference),
  // and the app shows it by name. Private hosts can't be fetched through image_url.
  const PNG =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const ssrf = await callTool(request, token, "add_image", {
    project_id: projectId,
    name: "hero",
    image_url: "https://127.0.0.1/secret.png",
  });
  expect(ssrf.isError).toBe(true);
  const added = await callTool(request, token, "add_image", {
    project_id: projectId,
    name: "hero",
    image_base64: PNG,
  });
  expect(added.isError, added.text).toBe(false);
  expect(added.text).toContain('<AiImage name="hero"');
  const images = await callTool(request, token, "read_files", {
    project_id: projectId,
    paths: ["data/images.ts"],
  });
  const imageUrl = /"hero": "([^"]+)"/.exec(images.text)![1]!;
  const served = await request.get(imageUrl);
  expect(served.status()).toBe(200);
  expect(served.headers()["content-type"]).toBe("image/png");

  const home = files.find((f) => f.path === "app/(tabs)/index.tsx")!;
  const withImage = home.content
    .replace(
      'import { HabitRow, streakFor } from "../../components/HabitRow";',
      'import { AiImage } from "../../components/AiImage";\nimport { HabitRow, streakFor } from "../../components/HabitRow";',
    )
    .replace(
      "<View style={{ flex: 1, backgroundColor: theme.colors.background }}>",
      '<View style={{ flex: 1, backgroundColor: theme.colors.background }}>\n      <AiImage name="hero" style={{ height: 120 }} />',
    );
  const shown = await callTool(request, token, "write_files", {
    project_id: projectId,
    files: [{ path: "app/(tabs)/index.tsx", content: withImage }],
    summary: "Add a hero image",
  });
  expect(shown.isError, shown.text).toBe(false);
  await expect(app.locator(`img[src="${imageUrl}"]`)).toBeVisible({ timeout: 20_000 });

  // Settings shows the connector URL and the connection; disconnecting stops it at once.
  await page.goto("/settings");
  await expect(page.getByTestId("mcp-url")).toHaveText(MCP);
  const connections = page.getByTestId("connections");
  await expect(connections).toContainText("Test Assistant");
  await connections.getByRole("button", { name: "Disconnect" }).click();
  await expect(connections).toContainText("No assistants connected yet.");
  const after = await rpc(request, token, "tools/list");
  expect(after.status).toBe(401);
});

test("MCP building needs a paid plan; connecting works from signed out", async ({
  page,
  request,
}) => {
  const email = await signUp(page, "free");
  await page.context().clearCookies();
  const token = await connect(page, request, email);
  const created = await callTool(request, token, "create_project", {
    name: "Nope",
    description: "x",
  });
  expect(created.isError).toBe(true);
  expect(created.text).toContain("part of the Pro plan");
});
