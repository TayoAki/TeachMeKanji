import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C } from "./brand";
import { Cursor, type Waypoint } from "./cursor";
import { loadFonts } from "./fonts";
import { camTransform, cameraAt, ramp, type CamKey } from "./motion";
import { PROMPT, T, typed, typingDone } from "./script";
import { HOOK_STATE_T, dialogIn, shots, shotsBusy, workspaceState } from "./state";
import { PromptBox } from "./ui/PromptBox";
import { StoreListingDialog } from "./ui/StoreListing";
import { Kinetic, Lockup } from "./ui/Type";
import { CANVAS, L, PHONE_H, Workspace, phoneX, phoneY, type WorkspaceState } from "./ui/Workspace";

loadFonts();

const W = 1920;
const H = 1080;

// ---- Places in the workspace world (UI px) ----
const canvasView = { x: L.centerX + L.centerW / 2, y: 342, s: W / L.centerW };
const paywall = { x: phoneX(1) + CANVAS.phoneW / 2, y: phoneY + PHONE_H * 0.42 };
const k = CANVAS.phoneW / 390; // capture px → UI px
const headline = { x: phoneX(1) + 150 * k, y: phoneY + 118 * k };
const gapBetween = { x: phoneX(1) + CANVAS.phoneW + CANVAS.gap / 2, y: phoneY + 230 * k };
const menuButton = { x: L.rail + L.sidebar - 12 - 14, y: 22 };
const storeItem = { x: L.rail + L.sidebar - 12 - 176 + 74, y: 40 + 4 + 32 * 2 + 16 };
export const DLG = { x: (L.W - 768) / 2, y: 70, w: 768 };
const makeShots = { x: 683, y: 604 };
const gridCenterY = 781;
const confirm = { x: 216, y: 858 };
const prices = { y: 360 };

// ---- Cameras per beat (absolute film time) ----
const hookCam: CamKey[] = [
  { t: 0, x: paywall.x + 64, y: paywall.y, s: 3.0 },
  { t: 2.3, ...canvasView },
  { t: 3.2, ...canvasView },
];
const promptCam: CamKey[] = [
  { t: T.prompt.start, x: 960, y: 520, s: 1.55 },
  { t: 5.3, x: 960, y: 525, s: 1.8 },
  { t: T.prompt.end, x: 960, y: 525, s: 1.8 },
];
const planWide = { x: 575, y: 500, s: 1.67 };
const wsCam: CamKey[] = [
  { t: T.plan.start, ...planWide },
  { t: 11.9, ...planWide },
  { t: 12.6, x: 343, y: prices.y, s: 2.8 },
  { t: 13.5, x: 343, y: prices.y, s: 2.8 },
  { t: 14.15, x: 343, y: 720, s: 2.8 },
  { t: 14.6, x: 343, y: 720, s: 2.8 },
  { t: 15.9, x: 960, y: 540, s: 1.0 },
  { t: 17.55, x: 960, y: 540, s: 1.0 },
  { t: 18.5, ...canvasView },
  { t: T.build.end, ...canvasView },
  // edit
  { t: T.edit.start, x: 900, y: 240, s: 2.3 },
  { t: 24.0, x: 900, y: 240, s: 2.3 },
  { t: 24.9, x: phoneX(1) + CANVAS.phoneW / 2, y: 212, s: 4.6 },
  { t: 27.4, x: phoneX(1) + CANVAS.phoneW / 2, y: 212, s: 4.6 },
  { t: 28.3, x: 960, y: 540, s: 1.0 },
  { t: T.listing.start, x: 960, y: 540, s: 1.0 },
  // listing
  { t: 29.7, x: 400, y: 225, s: 2.4 },
  { t: 30.6, x: 400, y: 225, s: 2.4 },
  // v1.1: the Google Play short description (production's truncated "…and finish with a",
  // y 263–371, x ≥ 966) stays out of frame: down the left column first, then hold below it.
  { t: 31.15, x: 430, y: 620, s: 2.3 },
  { t: 31.7, x: 960, y: 660, s: 2.05 },
  { t: 33.45, x: 960, y: 660, s: 2.05 },
  { t: 34.25, x: 960, y: gridCenterY, s: 2.4 },
  { t: T.listing.end, x: 960, y: gridCenterY, s: 2.4 },
];

const promptPath: Waypoint[] = [
  { t: 4.65, x: 1500, y: 930 },
  { t: 5.32, x: 700, y: 446, bow: 60 },
  { t: 5.6, x: 700, y: 446 },
  { t: 5.95, x: 1150, y: 640, bow: -30 },
  { t: 9.75, x: 1150, y: 640 },
  { t: 10.08, x: 1289, y: 543, bow: 20 },
  { t: T.prompt.end, x: 1289, y: 543 },
];
const wsPath: Waypoint[] = [
  { t: 13.65, x: 60, y: 980 },
  { t: 14.35, x: confirm.x, y: confirm.y, bow: 40 },
  { t: 14.6, x: confirm.x, y: confirm.y },
  { t: 15.4, x: 120, y: 1150, bow: -40 },
];
const editPath: Waypoint[] = [
  { t: 24.25, x: 330, y: 330 },
  { t: 25.0, x: headline.x, y: headline.y, bow: 25 },
  { t: 25.3, x: headline.x, y: headline.y },
  { t: 25.75, x: gapBetween.x, y: gapBetween.y, bow: -8 },
  { t: 27.1, x: gapBetween.x, y: gapBetween.y },
  { t: 27.22, x: gapBetween.x, y: gapBetween.y + 10 },
  { t: 29.0, x: gapBetween.x, y: gapBetween.y + 10 },
  { t: 29.85, x: menuButton.x, y: menuButton.y, bow: 60 },
  { t: 30.05, x: menuButton.x, y: menuButton.y },
  { t: 30.42, x: storeItem.x, y: storeItem.y, bow: 10 },
  { t: 30.7, x: storeItem.x, y: storeItem.y },
  { t: 31.3, x: DLG.x - 40, y: DLG.y + 560, bow: 40 },
  { t: 32.75, x: DLG.x - 40, y: DLG.y + 560 },
  { t: 33.25, x: makeShots.x, y: makeShots.y, bow: 20 },
  { t: 33.5, x: makeShots.x, y: makeShots.y },
  { t: 34.1, x: DLG.x - 120, y: DLG.y + 1000, bow: -40 },
];

export function wsStateFor(t: number, stateT = t): WorkspaceState {
  const base = workspaceState(stateT);
  const dIn = dialogIn(t);
  // The opening plan shot keeps the canvas readable ("Confirm it to build 7 screens"); the dim
  // comes in with the push to the prices.
  const planDim = t >= T.plan.start && t < 15.4 ? ramp(t, 11.9, 0.6) * (1 - ramp(t, 14.6, 0.6)) : 0;
  const editDim = t >= T.edit.start && t < 28.3 ? ramp(t, 24.0, 0.9) * (1 - ramp(t, 27.4, 0.7)) : 0;
  return {
    ...base,
    t,
    dim: Math.max(planDim, editDim),
    focus:
      planDim > 0
        ? { x: L.rail, y: 0, w: L.sidebar, h: L.H - L.footer }
        : editDim > 0
          ? { x: phoneX(1) - 6, y: phoneY - CANVAS.labelH - 4, w: CANVAS.phoneW + 12, h: PHONE_H + CANVAS.labelH + 10 }
          : null,
    dialog:
      dIn > 0 ? (
        <>
          <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${0.5 * dIn})`, backdropFilter: `blur(${4 * dIn}px)` }} />
          <div style={{ position: "absolute", left: DLG.x, top: DLG.y, opacity: dIn, transform: `scale(${0.96 + 0.04 * dIn})`, transformOrigin: "50% 30%" }}>
            <StoreListingDialog width={DLG.w} busy={shotsBusy(t)} shots={shots(t)} t={t} />
          </div>
        </>
      ) : null,
  };
}

function World({ cam, t, children }: { cam: CamKey[]; t: number; children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: camTransform(cameraAt(cam, t), W, H) }}>
      {children}
    </div>
  );
}

export const ProductFilm: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  let scene: React.ReactNode = null;
  if (t < T.hook.end) {
    scene = (
      <World cam={hookCam} t={t}>
        <Workspace s={{ ...wsStateFor(t, HOOK_STATE_T), toastIn: 0 }} />
      </World>
    );
  } else if (t < T.k1.end) {
    scene = <Kinetic t={t} start={T.k1.start} end={T.k1.end} text={T.k1.text} W={W} H={H} size={92} maxWidth={1400} />;
  } else if (t < T.prompt.end) {
    const p = T.prompt;
    const value = typed(t, PROMPT, p.typeStart, p.cps);
    const done = typingDone(PROMPT, p.typeStart, p.cps);
    scene = (
      <>
        <World cam={promptCam} t={t}>
          <div style={{ position: "relative", width: W, height: H, background: C.background }}>
            <div style={{ position: "absolute", left: 600, top: 400 }}>
              <PromptBox
                width={720}
                value={value}
                focused={t >= p.click}
                caretOn={t < done || Math.floor((t - done) / 0.5) % 2 === 0}
                busy={t >= p.sendClick}
                t={t}
              />
            </div>
          </div>
        </World>
        <Cursor t={t} path={promptPath} clicks={[p.click, p.sendClick]} cam={promptCam} W={W} H={H} />
      </>
    );
  } else if (t < T.build.end || (t >= T.k2.end && t < T.close.start)) {
    scene = (
      <>
        <World cam={wsCam} t={t}>
          <Workspace s={wsStateFor(t)} />
        </World>
        <Cursor t={t} path={wsPath} clicks={[T.plan.confirmClick]} cam={wsCam} W={W} H={H} />
        <Cursor
          t={t}
          path={editPath}
          clicks={[T.edit.dbl1, T.edit.dbl2, T.edit.clickAway, T.listing.menuClick, T.listing.itemClick, T.listing.shotsClick]}
          cam={wsCam}
          W={W}
          H={H}
        />
      </>
    );
  } else if (t < T.k2.end) {
    scene = <Kinetic t={t} start={T.k2.start} end={T.k2.end} text={T.k2.text} W={W} H={H} size={84} maxWidth={1300} />;
  } else {
    scene = <Lockup t={t} start={T.close.start} W={W} H={H} scale={1.5} />;
  }
  return <AbsoluteFill style={{ background: C.stage, overflow: "hidden" }}>{scene}</AbsoluteFill>;
};
