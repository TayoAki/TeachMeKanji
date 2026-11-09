import { defineConfig, devices } from "@playwright/test";

const ci = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  retries: ci ? 1 : 0,
  reporter: ci ? [["github"], ["list"]] : "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "off",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1600, height: 1400 } },
    },
  ],
  webServer: [
    {
      command: "npm run dev --workspace @appbuilder/preview",
      cwd: "../..",
      url: "http://localhost:3001",
      reuseExistingServer: !ci,
      timeout: 120_000,
    },
    {
      command: "npx next dev --port 3000",
      url: "http://localhost:3000",
      reuseExistingServer: !ci,
      timeout: 180_000,
      env: {
        NEXT_PUBLIC_PREVIEW_ORIGIN: "http://localhost:3001",
        DATABASE_URL:
          process.env.DATABASE_URL ?? "postgres://appbuilder:appbuilder@localhost:5432/appbuilder",
        BETTER_AUTH_SECRET:
          process.env.BETTER_AUTH_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-0123",
      },
    },
  ],
});
