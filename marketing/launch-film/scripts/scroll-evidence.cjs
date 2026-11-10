// Read-only: scrolls inside a canvas frame (the app's own ScrollView) and captures it. Every
// non-GET request to the app origin is blocked. Loads the stored login from a file; never prints it.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const base = "https://web-production-ea8f8.up.railway.app";
const account = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = process.argv[3];
const INDEX = Number(process.argv[4]);
const TAG = process.argv[5];
const STEPS = (process.argv[6] || "400,800,2000").split(",").map(Number);
(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(`${base}/sign-in`);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByTestId("credit-balance").waitFor({ timeout: 30000 });
  await page.route("**/*", (route) => {
    const r = route.request();
    if (r.method() !== "GET" && r.url().startsWith(base)) {
      console.log("blocked", r.method(), new URL(r.url()).pathname);
      return route.abort();
    }
    return route.continue();
  });
  await page.goto(`${base}/projects/${account.projectId}`);
  await page.getByTestId("canvas-screen").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(6000);
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(2500);
  const iframe = page.getByTestId("canvas-screen").nth(INDEX).locator("iframe");
  const box = await iframe.boundingBox();
  let done = 0;
  for (const target of STEPS) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.wheel(0, target - done);
    done = target;
    await page.waitForTimeout(1200);
    await iframe.screenshot({ path: path.join(out, `v3-${TAG}-scroll-${target}.png`) });
  }
  console.log("ok");
  await browser.close();
})().catch((e) => { console.error("FAILED:", e.message.split("\n")[0]); process.exit(1); });
