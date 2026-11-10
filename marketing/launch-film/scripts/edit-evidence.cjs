// Read-only: changes text only inside this headless browser's DOM (never saved), to show the
// result of the in-place text edit. Loads the stored login from a file; never prints it.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const base = "https://web-production-ea8f8.up.railway.app";
const account = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = process.argv[3];
const OLD = process.argv[4];
const NEW = process.argv[5];
const INDEX = Number(process.argv[6] || 0);
const TAG = process.argv[7] || "edit";
(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  // Block every non-GET request to the app origin after sign-in, as a guard against writes.
  await page.goto(`${base}/sign-in`);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByTestId("credit-balance").waitFor({ timeout: 30000 });
  await page.route("**/*", (route) => {
    const req = route.request();
    if (req.method() !== "GET" && req.url().startsWith(base)) {
      console.log("blocked", req.method(), new URL(req.url()).pathname);
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
  let target = null;
  for (const f of page.frames()) {
    const n = await f.getByText(OLD, { exact: true }).count().catch(() => 0);
    if (n) { target = f; break; }
  }
  if (!target) throw new Error("headline not found");
  const handle = await target.getByText(OLD, { exact: true }).first().elementHandle();
  const info = await handle.evaluate((el) => {
    el.setAttribute("data-film", "headline");
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const range = document.createRange();
    range.selectNodeContents(el);
    const lines = Array.from(range.getClientRects()).map((q) => ({ x: q.x, y: q.y, width: q.width, height: q.height }));
    return {
      lines,
      box: { x: r.x, y: r.y, width: r.width, height: r.height },
      viewport: { width: innerWidth, height: innerHeight },
      font: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, color: cs.color, line: cs.lineHeight,
      letterSpacing: cs.letterSpacing,
    };
  });
  fs.writeFileSync(path.join(out, `v3-${TAG}-headline.json`), JSON.stringify(info, null, 2));
  await iframe.screenshot({ path: path.join(out, `v3-${TAG}-0-before.png`) });
  await target.evaluate(() => {
    const el = document.querySelector('[data-film="headline"]');
    Object.assign(el.style, { outline: "2px solid #2563eb", outlineOffset: "2px" });
  });
  await page.waitForTimeout(300);
  await iframe.screenshot({ path: path.join(out, `v3-${TAG}-1-selected.png`) });
  await target.evaluate((NEW) => {
    const el = document.querySelector('[data-film="headline"]');
    el.textContent = NEW;
  }, NEW);
  await page.waitForTimeout(300);
  await iframe.screenshot({ path: path.join(out, `v3-${TAG}-2-typed.png`) });
  const after = await target.evaluate(() => {
    const el = document.querySelector('[data-film="headline"]');
    const r = el.getBoundingClientRect();
    el.style.outline = "";
    return { x: r.x, y: r.y, width: r.width, height: r.height };
  });
  fs.writeFileSync(path.join(out, `v3-${TAG}-after-box.json`), JSON.stringify(after, null, 2));
  await page.waitForTimeout(300);
  await iframe.screenshot({ path: path.join(out, `v3-${TAG}-3-after.png`) });
  console.log(JSON.stringify(info), JSON.stringify(after));
  await browser.close();
})().catch((e) => { console.error("FAILED:", e.message.split("\n")[0]); process.exit(1); });
