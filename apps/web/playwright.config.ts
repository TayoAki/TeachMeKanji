import { defineConfig, devices } from "@playwright/test";
import {
  E2E_ADMIN_TOKEN,
  E2E_AUTH_SECRET,
  E2E_BASE_URL,
  E2E_DATABASE_URL,
  E2E_PROD,
  E2E_STRIPE_KEY,
  E2E_STRIPE_PRICES,
  E2E_STRIPE_WEBHOOK_SECRET,
} from "./e2e/env";

const ci = Boolean(process.env.CI);
// A production run must never reuse dev servers that happen to be running.
const reuse = !ci && !E2E_PROD;

const shared = {
  DATABASE_URL: E2E_DATABASE_URL,
  BETTER_AUTH_SECRET: E2E_AUTH_SECRET,
  ENCRYPTION_KEY: `${E2E_AUTH_SECRET}-tokens`,
  // Two connectors point at a local stand-in MCP + OAuth server (e2e/mock-mcp-server.mjs).
  CONNECTOR_LINEAR_URL: "http://localhost:3005/mcp",
  CONNECTOR_NOTION_URL: "http://localhost:3005/mcp",
  CONNECTOR_REVENUECAT_URL: "http://localhost:3005/mcp",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 120_000,
  retries: ci ? 1 : 0,
  reporter: ci ? [["github"], ["list"]] : "list",
  use: {
    baseURL: E2E_BASE_URL ?? "http://localhost:3000",
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1400 } },
    },
  ],
  webServer: E2E_BASE_URL
    ? []
    : [
        {
          command: "node e2e/mock-mcp-server.mjs",
          url: "http://localhost:3005/health",
          reuseExistingServer: reuse,
          timeout: 20_000,
        },
        {
          // The worker runs agent jobs. Tests use the offline template generator, never a paid model.
          command: "npm run start --workspace @appbuilder/worker",
          cwd: "../..",
          reuseExistingServer: reuse,
          timeout: 60_000,
          wait: { stdout: /worker: started/ },
          env: {
            ...shared,
            LLM_PROVIDER: "fake",
            FAKE_LLM_DELAY_MS: "30",
            // No Expo dev servers in tests; the phone dialog reports that they're off.
            DEVICE_PREVIEW_ENABLED: "0",
            // Promo videos render for real, at a quarter of the size to keep the test quick.
            VIDEO_RENDER_SCALE: "0.25",
            ...(E2E_PROD ? { NODE_ENV: "production" } : {}),
          },
        },
        {
          command: E2E_PROD
            ? "npm run build --workspace @appbuilder/preview && npm run start --workspace @appbuilder/preview"
            : "npm run dev --workspace @appbuilder/preview",
          cwd: "../..",
          url: "http://localhost:3001",
          reuseExistingServer: reuse,
          timeout: 120_000,
          env: { PREVIEW_ALLOWED_PARENTS: "http://localhost:3000" },
        },
        {
          command: E2E_PROD
            ? "npx next build && npx next start --port 3000"
            : "npx next dev --port 3000",
          url: "http://localhost:3000",
          reuseExistingServer: reuse,
          timeout: E2E_PROD ? 400_000 : 180_000,
          env: {
            ...shared,
            BETTER_AUTH_URL: "http://localhost:3000",
            NEXT_PUBLIC_PREVIEW_ORIGIN: "http://localhost:3001",
            STRIPE_SECRET_KEY: E2E_STRIPE_KEY,
            STRIPE_WEBHOOK_SECRET: E2E_STRIPE_WEBHOOK_SECRET,
            // Placeholder prices: checkout itself needs a Stripe account; the webhook is exercised.
            STRIPE_PRICE_BUILDER: E2E_STRIPE_PRICES.builder,
            STRIPE_PRICE_PRO: E2E_STRIPE_PRICES.pro,
            // The suite signs up many users a minute and has no inbox. Production turns both on by
            // default; core.test.ts covers the verified-email rule.
            AUTH_RATE_LIMIT: "0",
            REQUIRE_VERIFIED_EMAIL: "0",
            // preview-runtime.spec.ts drives the runtime through the (otherwise dev-only) spike page.
            ENABLE_SPIKES: "1",
            ADMIN_API_TOKEN: E2E_ADMIN_TOKEN,
            // App Cloud's AI endpoint answers with the offline generator too.
            LLM_PROVIDER: "fake",
          },
        },
      ],
});
