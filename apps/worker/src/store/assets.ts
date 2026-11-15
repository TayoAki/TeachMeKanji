/**
 * The App Store assets App Builder makes for an app: its icon, drawn by the image model from the
 * plan, and the framed screenshots, rendered from the real app in the worker's headless Chrome
 * with the same framing as the builder's Store listing dialog (frameStoreShot).
 */
import sharp from "sharp";
import {
  frameStoreShot,
  iconPrompt,
  readableOn,
  STORE_ICON_SIZE,
  STORE_SHOT_SIZE,
  type AppPlan,
  type ProjectFiles,
} from "@appbuilder/contract";
import { getImageModel } from "../images/client";
import { getBrowser, renderScreens, withRenderer } from "../render/screens";

/** The app's primary color: the active theme's, else the plan's first. */
export function primaryOf(plan: AppPlan | null, themeId: string | null): string {
  const theme = plan?.themes.find((t) => t.id === themeId) ?? plan?.themes[0];
  return theme?.primary ?? "#4F46E5";
}

/**
 * The 1024 px icon (PNG, no transparency: the App Store refuses alpha), or null when this worker
 * has no image model. `charge` adds what drawing it cost to the run.
 */
export async function drawIcon(
  plan: AppPlan,
  primary: string,
  charge: (usd: number) => void,
): Promise<Buffer | null> {
  const model = getImageModel();
  if (!model) return null;
  const image = await model.draw({ prompt: iconPrompt(plan, primary), aspect: "1:1" });
  charge(image.costUsd);
  return sharp(image.data)
    .resize(STORE_ICON_SIZE, STORE_ICON_SIZE, { fit: "cover" })
    .flatten({ background: primary })
    .removeAlpha()
    .png()
    .toBuffer();
}

/**
 * The Android adaptive icon's foreground: the icon inside the middle two thirds, so the
 * launcher's mask only trims its background color.
 */
export async function adaptiveForeground(icon: Buffer, primary: string): Promise<Buffer> {
  const inner = Math.round(STORE_ICON_SIZE * 0.66);
  const pad = Math.round((STORE_ICON_SIZE - inner) / 2);
  return sharp(icon)
    .resize(inner, inner)
    .extend({
      top: pad,
      bottom: STORE_ICON_SIZE - inner - pad,
      left: pad,
      right: STORE_ICON_SIZE - inner - pad,
      background: primary,
    })
    .png()
    .toBuffer();
}

/**
 * Framed screenshots (1320 x 2868) of `shots`, in order. Screens that fail to render are left out.
 */
export async function frameShots(
  files: ProjectFiles,
  shots: Array<{ screen: string; caption: string }>,
  options: { themeId?: string; primary: string },
): Promise<Array<{ screen: string; caption: string; png: Buffer }>> {
  if (!shots.length) return [];
  const rendered = await renderScreens(files, {
    themeId: options.themeId,
    only: shots.map((s) => s.screen),
    scale: 3,
    settleMs: 1200,
  });
  const onPrimary = readableOn(options.primary);
  return withRenderer(async () => {
    const page = await (await getBrowser()).newPage();
    try {
      // The worker runs through tsx, which names functions with a __name() helper the page lacks.
      await page.evaluate("globalThis.__name = globalThis.__name || ((fn) => fn)");
      const out: Array<{ screen: string; caption: string; png: Buffer }> = [];
      for (const shot of shots) {
        const screen = rendered.find((r) => r.file === shot.screen);
        if (!screen?.png || screen.error) continue;
        const input = {
          png: `data:image/png;base64,${screen.png.toString("base64")}`,
          caption: shot.caption,
          width: STORE_SHOT_SIZE.width,
          height: STORE_SHOT_SIZE.height,
          primary: options.primary,
          onPrimary,
        };
        const dataUrl = (await page.evaluate(
          `(${frameStoreShot.toString()})(${JSON.stringify(input)})`,
        )) as string;
        // No transparency (the App Store refuses alpha).
        const png = await sharp(Buffer.from(dataUrl.slice(dataUrl.indexOf(",") + 1), "base64"))
          .flatten({ background: options.primary })
          .removeAlpha()
          .png()
          .toBuffer();
        out.push({ screen: shot.screen, caption: shot.caption, png });
      }
      return out;
    } finally {
      await page.close();
    }
  });
}
