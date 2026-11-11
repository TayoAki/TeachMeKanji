import { continueRender, delayRender, staticFile } from "remotion";

/** Geist (OFL, from the `geist` package), copied into the bundle's public folder by render.ts. */
export const FONT_FILES: Array<[file: string, weight: string]> = [
  ["Geist-Medium.woff2", "500"],
  ["Geist-SemiBold.woff2", "600"],
  ["Geist-Bold.woff2", "700"],
];

let loading: Promise<void> | null = null;

/** Block rendering until the fonts are in, so frame 0 never renders in a fallback face. */
export function useFonts(): void {
  if (loading || typeof document === "undefined") return;
  const handle = delayRender("fonts");
  loading = Promise.all(
    FONT_FILES.map(([file, weight]) => {
      const face = new FontFace("Geist", `url(${staticFile(`fonts/${file}`)})`, { weight });
      (document.fonts as unknown as { add: (f: FontFace) => void }).add(face);
      return face.load();
    }),
  )
    .then(() => continueRender(handle))
    .catch((error: unknown) => {
      console.error(error);
      continueRender(handle);
    });
}
