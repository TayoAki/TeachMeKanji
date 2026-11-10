import React from "react";
import { C, FONT, R } from "../brand";
import { inn, out, ramp } from "../motion";
import { dots } from "./Workspace";

/** A kinetic-type moment on its own card: words rise in, hold for reading time, then leave. */
export function Kinetic({
  t,
  start,
  end,
  text,
  W,
  H,
  size,
  maxWidth,
}: {
  t: number;
  start: number;
  end: number;
  text: string;
  W: number;
  H: number;
  size: number;
  maxWidth: number;
}) {
  const words = text.split(" ");
  const leave = ramp(t, end - 0.14, 0.14, inn);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, background: C.stage, ...dots, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div
        style={{
          maxWidth,
          textAlign: "center",
          font: `600 ${size}px/1.12 ${FONT.sans}`,
          letterSpacing: "-0.02em",
          color: C.foreground,
          opacity: 1 - leave,
          transform: `translateY(${-leave * 12}px)`,
          textWrap: "balance",
        }}
      >
        {words.map((w, i) => {
          const p = ramp(t, start + 0.04 + i * 0.045, 0.24, out);
          return (
            <span key={i} style={{ display: "inline-block", opacity: p, transform: `translateY(${(1 - p) * 18}px)`, marginRight: "0.26em" }}>
              {w}
            </span>
          );
        })}
      </div>
    </div>
  );
}

/** The close: the real lockup from the site header, then one true CTA. */
export function Lockup({ t, start, W, H, scale = 1 }: { t: number; start: number; W: number; H: number; scale?: number }) {
  const a = ramp(t, start + 0.05, 0.4, out);
  const b = ramp(t, start + 0.45, 0.4, out);
  const c = ramp(t, start + 0.75, 0.4, out);
  return (
    <div style={{ position: "absolute", left: 0, top: 0, width: W, height: H, background: C.stage, ...dots, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 36 * scale }}>
      <div style={{ display: "flex", alignItems: "center", gap: 20 * scale, opacity: a, transform: `translateY(${(1 - a) * 14}px)` }}>
        <span
          style={{
            width: 76 * scale,
            height: 76 * scale,
            borderRadius: R.lg * 2 * scale,
            background: C.primary,
            color: C.primaryForeground,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            font: `700 ${30 * scale}px/1 ${FONT.sans}`,
          }}
        >
          AB
        </span>
        <span style={{ font: `600 ${64 * scale}px/1 ${FONT.sans}`, letterSpacing: "-0.02em", color: C.foreground }}>App Builder</span>
      </div>
      <div style={{ opacity: b, transform: `translateY(${(1 - b) * 12}px)`, font: `400 ${24 * scale}px/1.3 ${FONT.sans}`, color: C.mutedForeground }}>
        Expo · React Native · iOS &amp; Android
      </div>
      <div
        style={{
          opacity: c,
          transform: `translateY(${(1 - c) * 12}px)`,
          height: 64 * scale,
          padding: `0 ${32 * scale}px`,
          borderRadius: R.lg * 1.4 * scale,
          background: C.primary,
          color: C.primaryForeground,
          display: "flex",
          alignItems: "center",
          font: `600 ${24 * scale}px/1 ${FONT.sans}`,
        }}
      >
        Start free with 100 credits
      </div>
    </div>
  );
}
