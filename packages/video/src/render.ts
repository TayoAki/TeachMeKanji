/**
 * Render a promo film with Remotion on the worker. The bundle (the composition, compiled once)
 * comes from VIDEO_BUNDLE_DIR when the image pre-built it, else it's built on first use. Each
 * render copies its screens (and optional music) into the bundle's public folder, renders the
 * MP4 and a poster (frame 0), and removes its copies again.
 */
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { availableParallelism, tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import { PROMO_FORMATS, promoTimeline } from "@appbuilder/contract";
import type { AppPromoProps } from "./remotion/AppPromo";
import { FONT_FILES } from "./remotion/fonts";

export type { AppPromoProps } from "./remotion/AppPromo";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
let bundling: Promise<string> | null = null;

/** The compiled composition: VIDEO_BUNDLE_DIR if it holds one, else built once per process. */
export function promoBundle(): Promise<string> {
  bundling ??= (async () => {
    const outDir = process.env.VIDEO_BUNDLE_DIR || undefined;
    if (outDir && existsSync(join(outDir, "index.html"))) return outDir;
    return bundle({
      entryPoint: join(here, "remotion/index.ts"),
      publicDir: await fontsFolder(),
      outDir,
      onProgress: () => {},
    });
  })().catch((error: unknown) => {
    bundling = null;
    throw error;
  });
  return bundling;
}

async function fontsFolder(): Promise<string> {
  const dir = join(tmpdir(), "appbuilder-video-public");
  await mkdir(join(dir, "fonts"), { recursive: true });
  // The package exports no package.json; its fonts sit next to dist/sans.js.
  const fonts = join(dirname(require.resolve("geist/font/sans")), "fonts/geist-sans");
  for (const [file] of FONT_FILES) {
    await copyFile(join(fonts, file), join(dir, "fonts", file));
  }
  return dir;
}

/**
 * Browser and licensing options shared by every render: a given Chrome headless shell (or the
 * one Remotion downloaded), and the Remotion company license key when one is set, which counts
 * production renders on remotion.pro (see docs/06-deploy.md).
 */
function browser() {
  return {
    // Tests render at a fraction of the size (e.g. 0.25) to stay fast; production renders at 1.
    scale: Number(process.env.VIDEO_RENDER_SCALE) || 1,
    browserExecutable: process.env.VIDEO_BROWSER_EXECUTABLE || null,
    chromiumOptions: { gl: "swangle" as const },
    licenseKey: process.env.REMOTION_LICENSE_KEY || null,
    isProduction: process.env.NODE_ENV === "production",
  };
}

function imageExtension(data: Buffer): "png" | "jpg" | "webp" {
  if (data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))) return "png";
  if (data.subarray(0, 4).toString("latin1") === "RIFF") return "webp";
  return "jpg";
}

export interface PromoRender {
  video: string;
  poster: string;
  seconds: number;
  width: number;
  height: number;
}

export async function renderPromo(input: {
  props: Omit<AppPromoProps, "shots" | "music">;
  /** One image per beat, in order. */
  shots: Buffer[];
  music: { data: Buffer; extension: string } | null;
  /** Where video.mp4 and poster.jpg are written. */
  outDir: string;
  onProgress?: (fraction: number) => void;
}): Promise<PromoRender> {
  const serveUrl = await promoBundle();
  const id = randomUUID();
  const assets = join(serveUrl, "public", "renders", id);
  await mkdir(assets, { recursive: true });
  await mkdir(input.outDir, { recursive: true });
  try {
    const shots: string[] = [];
    for (const [i, data] of input.shots.entries()) {
      const name = `shot-${i}.${imageExtension(data)}`;
      await writeFile(join(assets, name), data);
      shots.push(`renders/${id}/${name}`);
    }
    let music: string | null = null;
    if (input.music) {
      const name = `music.${input.music.extension.replace(/[^a-z0-9]/gi, "") || "mp3"}`;
      await writeFile(join(assets, name), input.music.data);
      music = `renders/${id}/${name}`;
    }
    const inputProps: AppPromoProps = { ...input.props, shots, music };
    const composition = await selectComposition({
      serveUrl,
      id: "AppPromo",
      inputProps,
      ...browser(),
    });
    const video = join(input.outDir, "video.mp4");
    await renderMedia({
      composition,
      serveUrl,
      inputProps,
      codec: "h264",
      crf: 20,
      pixelFormat: "yuv420p",
      colorSpace: "bt709",
      imageFormat: "jpeg",
      jpegQuality: 92,
      muted: !music,
      outputLocation: video,
      overwrite: true,
      // Containers often report the host's CPUs, so Remotion's default (half of them) can
      // open more Chrome tabs than the container's memory holds.
      concurrency:
        Number(process.env.VIDEO_RENDER_CONCURRENCY) ||
        Math.max(1, Math.min(4, Math.floor(availableParallelism() / 2))),
      onProgress: ({ progress }) => input.onProgress?.(progress),
      ...browser(),
    });
    const poster = join(input.outDir, "poster.jpg");
    await renderStill({
      composition,
      serveUrl,
      inputProps,
      frame: 0,
      output: poster,
      imageFormat: "jpeg",
      jpegQuality: 85,
      overwrite: true,
      ...browser(),
    });
    const format = PROMO_FORMATS[input.props.format];
    return {
      video,
      poster,
      seconds: promoTimeline(input.props.storyboard).duration,
      width: format.width,
      height: format.height,
    };
  } finally {
    await rm(assets, { recursive: true, force: true });
  }
}
