import { Easing, interpolate } from "remotion";

export const inOut = Easing.bezier(0.65, 0, 0.35, 1);
export const out = Easing.bezier(0.16, 1, 0.3, 1);
export const inn = Easing.bezier(0.7, 0, 0.84, 0);

/** 0→1 over [start, start+dur] with an ease; clamped. */
export function ramp(t: number, start: number, dur: number, ease = out): number {
  return interpolate(t, [start, start + dur], [0, 1], {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

/** Fade in at a, out at b. */
export function window(t: number, a: number, b: number, fadeIn = 0.2, fadeOut = 0.15): number {
  if (t < a || t > b) return 0;
  return Math.min(ramp(t, a, fadeIn), 1 - ramp(t, b - fadeOut, fadeOut, inn));
}

export interface Cam {
  x: number;
  y: number;
  s: number;
}
export type CamKey = Cam & { t: number };

/** Camera between keys: eased move; scale interpolated in log space so zooms feel even. */
export function cameraAt(keys: CamKey[], t: number): Cam {
  if (t <= keys[0].t) return keys[0];
  for (let i = 0; i < keys.length - 1; i++) {
    const a = keys[i];
    const b = keys[i + 1];
    if (t <= b.t) {
      const p = inOut((t - a.t) / Math.max(1e-6, b.t - a.t));
      const s = Math.exp(Math.log(a.s) + (Math.log(b.s) - Math.log(a.s)) * p);
      // Keep the point under the eye moving on a straight screen path while zooming.
      return { x: a.x + (b.x - a.x) * p, y: a.y + (b.y - a.y) * p, s };
    }
  }
  return keys[keys.length - 1];
}

/** CSS transform for a world container (origin top-left) viewed by `cam` in a W×H frame. */
export function camTransform(cam: Cam, W: number, H: number): string {
  return `translate(${W / 2 - cam.x * cam.s}px, ${H / 2 - cam.y * cam.s}px) scale(${cam.s})`;
}

export function toScreen(cam: Cam, p: { x: number; y: number }, W: number, H: number) {
  return { x: W / 2 + (p.x - cam.x) * cam.s, y: H / 2 + (p.y - cam.y) * cam.s };
}
