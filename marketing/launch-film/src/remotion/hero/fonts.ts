import { continueRender, delayRender, staticFile } from "remotion";

const FACES: Array<[family: string, file: string, weight: string]> = [
  ["Geist", "fonts/Geist-Regular.woff2", "400"],
  ["Geist", "fonts/Geist-Medium.woff2", "500"],
  ["Geist", "fonts/Geist-SemiBold.woff2", "600"],
  ["Geist", "fonts/Geist-Bold.woff2", "700"],
  ["GeistMono", "fonts/GeistMono-Regular.woff2", "400"],
  ["InterFilm", "fonts/Inter-Bold.otf", "700"],
];

let loaded = false;
export function loadFonts() {
  if (loaded || typeof document === "undefined") return;
  loaded = true;
  const handle = delayRender("fonts");
  Promise.all(
    FACES.map(([family, file, weight]) => {
      const face = new FontFace(family, `url(${staticFile(file)})`, { weight });
      (document.fonts as unknown as { add: (f: FontFace) => void }).add(face);
      return face.load();
    }),
  )
    .then(() => continueRender(handle))
    .catch((e) => {
      console.error(e);
      continueRender(handle);
    });
}
