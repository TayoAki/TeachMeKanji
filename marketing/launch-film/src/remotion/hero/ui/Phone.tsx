import React from "react";
import { Img, staticFile } from "remotion";
import { C, FONT } from "../brand";
import { EDIT } from "./data";

/** Captured frames are the canvas iframe at 390×844 CSS px (an 8 px bezel included) at 2.85×. */
export const FRAME = { width: 390, height: 844 } as const;
export const PHONE_ASPECT = 2406 / 1113;

/**
 * A captured screen of the generated app (a real production capture), with an overlay layer in
 * the frame's own CSS px (390 wide), so edit outlines and typed text sit exactly on the capture.
 */
export function Phone({
  src,
  width,
  overlay,
  style,
}: {
  src: string;
  width: number;
  overlay?: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const k = width / FRAME.width;
  return (
    <div style={{ position: "relative", width, height: width * PHONE_ASPECT, ...style }}>
      <Img
        src={staticFile(src)}
        style={{ width: "100%", height: "100%", display: "block", borderRadius: 34 * k }}
      />
      {overlay ? (
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            width: FRAME.width,
            height: FRAME.height,
            transform: `scale(${k})`,
            transformOrigin: "0 0",
          }}
        >
          {overlay}
        </div>
      ) : null}
    </div>
  );
}

/**
 * The in-place text edit, from the preview runtime's real behaviour (apps/preview/src/selection.ts):
 * double-click outlines the text in #2563eb and selects all of it; typing replaces it (the layout
 * reflows at the first key); clicking away saves. Geometry from EDIT (measured on production).
 */
export function HeadlineEdit({
  phase,
  text,
  caretOn,
}: {
  phase: "selected" | "typing" | "done";
  text: string;
  caretOn: boolean;
}) {
  const { box, lineWidths, lineH, fontSize } = EDIT;
  const outline = (h: number): React.CSSProperties => ({
    position: "absolute",
    left: box.x - 4,
    top: box.y - 4,
    width: box.w + 8,
    height: h + 8,
    border: `2px solid ${C.editOutline}`,
    boxSizing: "border-box",
  });
  if (phase === "selected") {
    return (
      <>
        {lineWidths.map((w, i) => (
          <div key={i} style={{ position: "absolute", left: box.x, top: box.y + i * lineH, width: w, height: lineH, background: C.selection }} />
        ))}
        <div style={outline(lineH * lineWidths.length)} />
      </>
    );
  }
  if (phase !== "typing") return null;
  return (
    <>
      <div style={{ position: "absolute", left: box.x - 2, top: box.y - 1, width: box.w + 6, height: lineH + 2, background: C.appBg }} />
      <div
        style={{
          position: "absolute",
          left: box.x,
          top: box.y,
          width: box.w,
          font: `700 ${fontSize}px/${lineH}px ${FONT.app}`,
          color: C.appText,
          whiteSpace: "nowrap",
        }}
      >
        {text}
        <span
          style={{
            display: "inline-block",
            width: 2,
            height: fontSize + 2,
            marginLeft: 1,
            verticalAlign: -5,
            background: caretOn ? C.appText : "transparent",
          }}
        />
      </div>
      <div style={outline(lineH)} />
    </>
  );
}
