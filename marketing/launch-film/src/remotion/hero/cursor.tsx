import React from "react";
import { cameraAt, inOut, toScreen, type CamKey } from "./motion";

export interface Waypoint {
  t: number;
  x: number;
  y: number;
  /** Bow of the arc into this waypoint, in world px (perpendicular offset of the control point). */
  bow?: number;
}

/**
 * The cursor actor: travels on quadratic arcs between waypoints (world coordinates), drawn in
 * screen space at a constant size, with ~0.1 s of press state at each click.
 */
export function Cursor({
  t,
  path,
  clicks,
  cam,
  W,
  H,
  size = 34,
}: {
  t: number;
  path: Waypoint[];
  clicks: number[];
  cam: CamKey[];
  W: number;
  H: number;
  size?: number;
}) {
  if (path.length === 0 || t < path[0].t || t > path[path.length - 1].t) return null;
  let p = { x: path[0].x, y: path[0].y };
  for (let i = 0; i < path.length - 1; i++) {
    const a = path[i];
    const b = path[i + 1];
    if (t >= a.t && t <= b.t) {
      const u = inOut((t - a.t) / Math.max(1e-6, b.t - a.t));
      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len = Math.hypot(dx, dy) || 1;
      const bow = b.bow ?? len * 0.12;
      const cx = mx + (-dy / len) * bow;
      const cy = my + (dx / len) * bow;
      p = {
        x: (1 - u) * (1 - u) * a.x + 2 * (1 - u) * u * cx + u * u * b.x,
        y: (1 - u) * (1 - u) * a.y + 2 * (1 - u) * u * cy + u * u * b.y,
      };
      break;
    }
  }
  const s = toScreen(cameraAt(cam, t), p, W, H);
  const press = clicks.some((c) => t >= c && t < c + 0.1);
  const ripple = clicks.map((c) => t - c).find((d) => d >= 0 && d < 0.35);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, pointerEvents: "none" }}>
      {ripple !== undefined ? (
        <div
          style={{
            position: "absolute",
            left: s.x - size * 0.6,
            top: s.y - size * 0.6,
            width: size * 1.2,
            height: size * 1.2,
            borderRadius: "50%",
            border: "2px solid rgba(255,255,255,0.75)",
            opacity: 1 - ripple / 0.35,
            transform: `scale(${0.5 + ripple * 2.2})`,
          }}
        />
      ) : null}
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        style={{
          position: "absolute",
          left: s.x - (size * 5) / 24,
          top: s.y - (size * 2.5) / 24,
          transform: `scale(${press ? 0.86 : 1})`,
          transformOrigin: "20.8% 10.4%",
          filter: "drop-shadow(0 2px 3px rgba(0,0,0,0.45))",
        }}
      >
        <path
          d="M5 2.5 L5 19.5 L9.4 15.4 L12.3 21.6 L15.1 20.4 L12.2 14.3 L18.2 14.3 Z"
          fill="#fff"
          stroke="#111"
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}
