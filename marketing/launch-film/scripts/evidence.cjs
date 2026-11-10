// Read-only evidence walk on production. Loads a stored login from a file; never prints it.
const { chromium } = require("playwright");
const fs = require("fs");
const path = require("path");
const base = "https://web-production-ea8f8.up.railway.app";
const account = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const out = process.argv[3];
const tag = process.argv[4] || "v2";
fs.mkdirSync(out, { recursive: true });
const save = (name, data) => fs.writeFileSync(path.join(out, name), data);

(async () => {
  const browser = await chromium.launch({ proxy: { server: process.env.HTTPS_PROXY } });
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1100 }, deviceScaleFactor: 3 });
  const page = await ctx.newPage();
  await page.goto(`${base}/sign-in`);
  await page.locator("#email").fill(account.email);
  await page.locator("#password").fill(account.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByTestId("credit-balance").waitFor({ timeout: 30000 });
  await page.goto(`${base}/projects/${account.projectId}`);
  await page.getByTestId("canvas-screen").first().waitFor({ timeout: 60000 });
  await page.waitForTimeout(8000);
  await page.screenshot({ path: path.join(out, `${tag}-workspace.png`), scale: "css" });

  const info = {
    title: await page.locator("header, nav").first().innerText().catch(() => ""),
    chat: await page.getByTestId("chat-messages").innerText().catch(() => ""),
    screens: await page.getByTestId("canvas-screen-title").allInnerTexts(),
    status: await page.getByTestId("status").innerText().catch(() => ""),
    hint: await page.getByTestId("canvas-hint").innerText().catch(() => ""),
    rightPanel: await page.locator("aside").last().innerText().catch(() => ""),
  };
  save(`${tag}-info.json`, JSON.stringify(info, null, 2));
  console.log("screens:", info.screens.length, info.screens.map((s) => s.split("\n").join(" ")).join(" | "));

  // Zoom the canvas to 95% (client-only state) and shoot each frame at 3x.
  for (let i = 0; i < 4; i++) await page.getByRole("button", { name: "Zoom in" }).click();
  await page.waitForTimeout(1500);
  const canvas = page.getByTestId("canvas");
  const frames = page.getByTestId("canvas-screen");
  const n = await frames.count();
  async function shootAll(suffix) {
    for (let i = 0; i < n; i++) {
      const iframe = frames.nth(i).locator("iframe");
      // Pan so the frame is in view: wheel without ctrl pans the canvas.
      for (let k = 0; k < 20; k++) {
        const box = await iframe.boundingBox();
        const cbox = await canvas.boundingBox();
        if (!box || !cbox) break;
        const dx = box.x - (cbox.x + 40);
        if (Math.abs(dx) < 5) break;
        await canvas.hover({ position: { x: 200, y: 400 } });
        await page.mouse.wheel(dx, 0);
        await page.waitForTimeout(150);
      }
      await page.waitForTimeout(600);
      await iframe.screenshot({ path: path.join(out, `${tag}-screen-${i}${suffix}.png`) });
    }
  }
  await shootAll("");

  // Appearance switch is client-only preview state.
  const light = page.getByTestId("app-appearance-light");
  const dark = page.getByTestId("app-appearance-dark");
  if (await light.count()) {
    const lightPressed = await light.getAttribute("aria-pressed");
    const other = lightPressed === "true" ? dark : light;
    await other.click();
    await page.waitForTimeout(4000);
    await shootAll("-alt");
    info.altAppearance = lightPressed === "true" ? "dark" : "light";
    await (lightPressed === "true" ? light : dark).click();
    await page.waitForTimeout(2000);
  }

  // Text styles inside the preview frames (for the in-place edit beat).
  const previewFrames = page.frames().filter((f) => f.url().includes("preview"));
  info.previewFrameUrls = previewFrames.length;
  const texts = [];
  for (const f of previewFrames) {
    const t = await f
      .evaluate(() => {
        const all = Array.from(document.querySelectorAll("div[dir], span, div"));
        return all
          .filter((el) => el.children.length === 0 && el.textContent.trim().length > 3)
          .slice(0, 40)
          .map((el) => {
            const cs = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return {
              text: el.textContent.trim().slice(0, 80),
              font: cs.fontFamily, size: cs.fontSize, weight: cs.fontWeight, color: cs.color,
              line: cs.lineHeight, box: [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)],
            };
          });
      })
      .catch(() => []);
    texts.push({ url: f.url().split("?")[0], t });
  }
  save(`${tag}-texts.json`, JSON.stringify(texts, null, 2));

  // Store listing (GET only) and client-side screenshots.
  await page.getByRole("button", { name: "Project menu" }).click();
  await page.getByTestId("open-listing").click();
  await page.waitForTimeout(4000);
  if (await page.getByTestId("listing").count()) {
    info.listing = await page.getByTestId("listing").innerText();
    await page.screenshot({ path: path.join(out, `${tag}-listing-dialog.png`), scale: "css" });
    await page.getByTestId("listing-screenshots").click();
    const shots = page.getByTestId("listing-shots").locator("img");
    await shots.first().waitFor({ timeout: 90000 });
    let count = 0;
    for (let k = 0; k < 40; k++) {
      await page.waitForTimeout(2000);
      const c = await shots.count();
      if (c === count && c > 0 && !(await page.getByTestId("listing-screenshots").isDisabled())) break;
      count = c;
    }
    const total = await shots.count();
    for (let i = 0; i < total; i++) {
      const src = await shots.nth(i).getAttribute("src");
      save(`${tag}-store-${i}.png`, Buffer.from(src.split(",")[1], "base64"));
    }
    await page.screenshot({ path: path.join(out, `${tag}-listing-shots.png`), scale: "css" });
    console.log("store screenshots:", total);
  } else {
    info.listing = null;
    console.log("no listing on this project");
  }
  save(`${tag}-info.json`, JSON.stringify(info, null, 2));
  await browser.close();
})().catch((e) => {
  console.error("FAILED:", e.message.split("\n")[0]);
  process.exit(1);
});
