/**
 * Drawing images for the design step (mockups and mascot poses). Claude writes the code; an image
 * model draws the pictures, reached through OpenRouter (OPENROUTER_API_KEY, IMAGE_MODEL). Tests and
 * demos without a key use the offline generator, which draws simple shapes in the same formats.
 */
import sharp from "sharp";

export type Aspect = "9:16" | "1:1";

export interface ImageRequest {
  prompt: string;
  /** Reference images (the key screen, the mascot) the drawing must match. */
  refs?: Buffer[];
  aspect: Aspect;
}

export interface DrawnImage {
  data: Buffer;
  mediaType: "image/png" | "image/jpeg";
  /** What drawing it cost (USD), as the provider reported it. */
  costUsd: number;
}

export interface ImageModel {
  name: string;
  offline: boolean;
  draw(request: ImageRequest): Promise<DrawnImage>;
}

export class ImageError extends Error {}

export const mediaTypeOf = (data: Buffer): "image/png" | "image/jpeg" =>
  data[0] === 0x89 ? "image/png" : "image/jpeg";

const dataUrl = (data: Buffer) => `data:${mediaTypeOf(data)};base64,${data.toString("base64")}`;

/** The image model this worker uses, or null when none is configured. */
export function getImageModel(): ImageModel | null {
  if (process.env.LLM_PROVIDER === "fake" || process.env.IMAGE_PROVIDER === "fake")
    return offlineImages();
  const key = process.env.OPENROUTER_API_KEY || "";
  if (!key) return null;
  return openRouterImages(key, process.env.IMAGE_MODEL || "google/gemini-3-pro-image");
}

/** Typical price of one image when the provider doesn't report it (Nano Banana Pro, 2026-11). */
const FALLBACK_IMAGE_USD = 0.14;

export function openRouterImages(
  key: string,
  model: string,
  fetchImpl: typeof fetch = fetch,
): ImageModel {
  return {
    name: model,
    offline: false,
    async draw(request) {
      let lastError = "no image returned";
      for (let attempt = 1; attempt <= 3; attempt++) {
        const response = await fetchImpl("https://openrouter.ai/api/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
          signal: AbortSignal.timeout(180_000),
          body: JSON.stringify({
            model,
            modalities: ["image", "text"],
            image_config: { aspect_ratio: request.aspect },
            messages: [
              {
                role: "user",
                content: [
                  { type: "text", text: request.prompt },
                  ...(request.refs ?? []).map((ref) => ({
                    type: "image_url",
                    image_url: { url: dataUrl(ref) },
                  })),
                ],
              },
            ],
          }),
        });
        const body = (await response.json().catch(() => ({}))) as {
          choices?: Array<{ message?: { images?: Array<{ image_url?: { url?: string } }> } }>;
          usage?: { cost?: number };
          error?: { message?: string };
        };
        const url = body.choices?.[0]?.message?.images?.[0]?.image_url?.url;
        if (response.ok && url?.startsWith("data:")) {
          const data = Buffer.from(url.slice(url.indexOf(",") + 1), "base64");
          return {
            data,
            mediaType: mediaTypeOf(data),
            costUsd: typeof body.usage?.cost === "number" ? body.usage.cost : FALLBACK_IMAGE_USD,
          };
        }
        lastError = body.error?.message || `HTTP ${response.status}`;
        // Out of credit or a bad key won't fix itself on a retry.
        if (response.status === 401 || response.status === 402 || response.status === 403) break;
      }
      throw new ImageError(`The image model couldn't draw this (${lastError}).`);
    },
  };
}

/** A stable color for a prompt, so the offline mockups differ from screen to screen. */
function colorFor(text: string): { r: number; g: number; b: number } {
  let h = 0;
  for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const [r, g, b] = [0, 8, 4].map((n) => {
    const k = (n + hue / 30) % 12;
    return Math.round(255 * (0.62 - 0.25 * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  });
  return { r: r!, g: g!, b: b! };
}

/**
 * The offline generator: a phone-shaped mockup (header, cards, a button) or, for a character, a
 * round figure on a pure green background, so the real pipeline (keying, storage, the approval
 * screen, the build) runs end to end without an image model.
 */
export function offlineImages(): ImageModel {
  return {
    name: "offline",
    offline: true,
    async draw(request) {
      const { r, g, b } = colorFor(request.prompt);
      const character = /green \(#00FF00\) background/i.test(request.prompt);
      const [width, height] = request.aspect === "1:1" ? [512, 512] : [360, 640];
      const svg = character
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#00FF00"/><circle cx="256" cy="270" r="150" fill="rgb(${r},${g},${b})"/><circle cx="205" cy="245" r="18" fill="#fff"/><circle cx="307" cy="245" r="18" fill="#fff"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#F7F7F9"/><rect x="24" y="64" width="180" height="22" rx="6" fill="rgb(${r},${g},${b})"/><rect x="24" y="110" width="312" height="150" rx="18" fill="rgb(${r},${g},${b})" opacity="0.85"/><rect x="24" y="280" width="312" height="70" rx="14" fill="#E4E4EA"/><rect x="24" y="364" width="312" height="70" rx="14" fill="#E4E4EA"/><rect x="24" y="540" width="312" height="52" rx="26" fill="rgb(${r},${g},${b})"/></svg>`;
      const data = await sharp(Buffer.from(svg)).png().toBuffer();
      return { data, mediaType: "image/png", costUsd: 0 };
    },
  };
}
