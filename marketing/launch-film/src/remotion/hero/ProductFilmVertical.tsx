import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "./brand";
import { Cursor, type Waypoint } from "./cursor";
import { loadFonts } from "./fonts";
import { camTransform, cameraAt, ramp, window as fadeWindow, type CamKey } from "./motion";
import { PROMPT, T, typed, typingDone } from "./script";
import { HOOK_STATE_T, dialogIn, shots, shotsBusy, workspaceState } from "./state";
import { wsStateFor } from "./ProductFilm";
import { Spin } from "./ui/kit";
import { PromptBox } from "./ui/PromptBox";
import { StoreListingDialog } from "./ui/StoreListing";
import { Kinetic, Lockup } from "./ui/Type";
import { CanvasFrames, Workspace, dots, type WorkspaceState } from "./ui/Workspace";

loadFonts();

const W = 1080;
const H = 1920;
const CURSOR = 50;

// ---- Tall canvas: the same frames wrapped into three columns (a recomposition) ----
const TC = { cols: 3, phoneW: 290, gapX: 24, gapY: 36, labelScale: 2, x0: 40, y0: 430 };
const TPH = TC.phoneW * (2406 / 1113);
const TLH = 28 * TC.labelScale;
const tPhone = (i: number) => ({
  x: TC.x0 + (i % 3) * (TC.phoneW + TC.gapX),
  y: TC.y0 + Math.floor(i / 3) * (TPH + TLH + TC.gapY) + TLH,
});
const tk = TC.phoneW / 390;
const tHeadline = { x: tPhone(1).x + 150 * tk, y: tPhone(1).y + 118 * tk };
const tGap = { x: tPhone(1).x + TC.phoneW + TC.gapX / 2, y: tPhone(1).y + 260 * tk };

function TallCanvas({ s, chrome = true }: { s: WorkspaceState; chrome?: boolean }) {
  const hint = { font: `400 22px/1.35 ${FONT.sans}`, color: C.mutedForeground };
  return (
    <div style={{ position: "relative", width: W, height: 2560, background: C.background, ...dots }}>
      {chrome ? (
      <div
        style={{
          position: "absolute",
          left: 540,
          top: 250,
          transform: "translateX(-50%)",
          borderRadius: 999,
          border: `1px solid ${C.border}`,
          background: "oklch(0.145 0 0 / 90%)",
          padding: "10px 26px",
          textAlign: "center",
          whiteSpace: "nowrap",
          ...hint,
        }}
      >
        Click a screen to change it in the chat
        <br />
        Double-click text to edit it yourself (free)
      </div>
      ) : null}
      <div style={{ position: "absolute", left: 0, top: 360, width: W, display: "flex", justifyContent: "center", gap: 10, ...hint, fontSize: 20 }}>
        {s.building ? (
          <>
            <Spin size={20} t={s.t} /> {s.step}
          </>
        ) : s.version && chrome ? (
          `Ready · Version ${s.version}`
        ) : null}
      </div>
      <CanvasFrames s={s} x0={TC.x0} y0={TC.y0} layout={TC} />
    </div>
  );
}

// ---- Narrow dialog world ----
export const ND = { x: 310, y: 300, w: 460 };

// ---- Cameras ----
const hookCam: CamKey[] = [
  { t: 0, x: tPhone(1).x + TC.phoneW / 2, y: 880, s: 1.75 },
  { t: 2.3, x: 520, y: 1010, s: 1.0 },
  { t: 3.2, x: 520, y: 1010, s: 1.0 },
];
const promptCam: CamKey[] = [
  { t: T.prompt.start, x: 540, y: 930, s: 1.75 },
  { t: 5.3, x: 540, y: 910, s: 2.0 },
  { t: T.prompt.end, x: 540, y: 910, s: 2.0 },
];
const chatX = 200;
const planCam: CamKey[] = [
  { t: T.plan.start, x: chatX, y: 420, s: 3.4 },
  { t: 11.9, x: chatX, y: 420, s: 3.4 },
  { t: 12.6, x: chatX, y: 380, s: 3.6 },
  { t: 13.5, x: chatX, y: 380, s: 3.6 },
  { t: 14.15, x: chatX, y: 760, s: 3.6 },
  { t: 14.9, x: chatX, y: 760, s: 3.6 },
];
const buildCam: CamKey[] = [
  { t: 14.9, x: 520, y: 1000, s: 1.0 },
  { t: 17.6, x: 520, y: 1000, s: 1.0 },
  { t: 18.6, x: 520, y: 1330, s: 0.76 },
  { t: T.build.end, x: 520, y: 1330, s: 0.76 },
];
const editCam: CamKey[] = [
  { t: T.edit.start, x: 520, y: 780, s: 1.25 },
  { t: 24.0, x: 520, y: 780, s: 1.25 },
  { t: 24.9, x: tPhone(1).x + TC.phoneW / 2, y: tHeadline.y + 110, s: 3.3 },
  { t: 27.4, x: tPhone(1).x + TC.phoneW / 2, y: tHeadline.y + 110, s: 3.3 },
  { t: 28.3, x: 520, y: 820, s: 1.25 },
  { t: T.edit.end, x: 520, y: 820, s: 1.25 },
];
const menuCam: CamKey[] = [
  { t: T.listing.start, x: chatX, y: 266, s: 3.6 },
  { t: 30.75, x: chatX, y: 266, s: 3.6 },
];
// Measured on the DebugDialogNarrow still: buttons at y 834, screenshot grid 867–1434.
const dialogCam: CamKey[] = [
  { t: 30.75, x: 560, y: 600, s: 2.0 },
  { t: 32.6, x: 560, y: 600, s: 2.0 },
  { t: 33.2, x: 560, y: 700, s: 2.0 },
  { t: 33.45, x: 560, y: 700, s: 2.0 },
  { t: 34.25, x: 560, y: 1150, s: 2.0 },
  { t: T.listing.end, x: 560, y: 1150, s: 2.0 },
];

// ---- Cursor paths ----
const promptPath: Waypoint[] = [
  { t: 4.65, x: 860, y: 1300 },
  { t: 5.32, x: 380, y: 850, bow: 40 },
  { t: 5.6, x: 380, y: 850 },
  { t: 5.95, x: 700, y: 1060, bow: -20 },
  { t: 9.75, x: 700, y: 1060 },
  { t: 10.08, x: 755, y: 948, bow: 10 },
  { t: T.prompt.end, x: 755, y: 948 },
];
const planPath: Waypoint[] = [
  { t: 13.65, x: 60, y: 1000 },
  { t: 14.35, x: 216, y: 858, bow: 20 },
  { t: 14.9, x: 216, y: 858 },
];
const editPath: Waypoint[] = [
  { t: 24.25, x: 200, y: 900 },
  { t: 25.0, x: tHeadline.x, y: tHeadline.y, bow: 30 },
  { t: 25.3, x: tHeadline.x, y: tHeadline.y },
  { t: 25.75, x: tGap.x, y: tGap.y, bow: -10 },
  { t: 27.1, x: tGap.x, y: tGap.y },
  { t: 27.22, x: tGap.x, y: tGap.y + 12 },
  { t: 28.0, x: tGap.x + 400, y: tGap.y + 900, bow: -40 },
];
const menuPath: Waypoint[] = [
  { t: 29.1, x: 60, y: 500 },
  { t: 29.85, x: 318, y: 22, bow: 30 },
  { t: 30.05, x: 318, y: 22 },
  { t: 30.42, x: 230, y: 124, bow: 8 },
  { t: 30.75, x: 230, y: 124 },
];
const makeShotsN = { x: 418, y: 834 };
function dialogPath(btnY: number): Waypoint[] {
  return [
    { t: 32.65, x: 760, y: 1500 },
    { t: 33.25, x: makeShotsN.x, y: btnY, bow: 30 },
    { t: 33.5, x: makeShotsN.x, y: btnY },
    { t: 34.1, x: makeShotsN.x - 300, y: btnY + 900, bow: -30 },
  ];
}
// Button row y inside the narrow dialog (measured on a debug still)
const N_BTN_Y = makeShotsN.y;

function World({ cam, t, children }: { cam: CamKey[]; t: number; children: React.ReactNode }) {
  return (
    <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: camTransform(cameraAt(cam, t), W, H) }}>
      {children}
    </div>
  );
}

function TextHook({ t }: { t: number }) {
  const o = 1 - ramp(t, T.hook.end - 0.2, 0.2);
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        top: 96,
        width: 972,
        display: "flex",
        justifyContent: "center",
        opacity: o,
      }}
    >
      <div
        style={{
          padding: "18px 30px",
          borderRadius: 22,
          background: "oklch(0.145 0 0 / 88%)",
          border: `1px solid ${C.border}`,
          font: `600 64px/1.12 ${FONT.sans}`,
          letterSpacing: "-0.02em",
          color: C.foreground,
          textAlign: "center",
          maxWidth: 860,
        }}
      >
        Your app idea, paywall included.
      </div>
    </div>
  );
}

export const ProductFilmVertical: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const l = T.listing;
  let scene: React.ReactNode = null;

  if (t < T.hook.end) {
    const s = { ...wsStateFor(t, HOOK_STATE_T), toastIn: 0 };
    scene = (
      <>
        <World cam={hookCam} t={t}>
          <TallCanvas s={s} chrome={false} />
        </World>
        <TextHook t={t} />
      </>
    );
  } else if (t < T.k1.end) {
    scene = <Kinetic t={t} start={T.k1.start} end={T.k1.end} text={T.k1.text} W={W} H={H} size={104} maxWidth={860} />;
  } else if (t < T.prompt.end) {
    const p = T.prompt;
    const done = typingDone(PROMPT, p.typeStart, p.cps);
    scene = (
      <>
        <World cam={promptCam} t={t}>
          <div style={{ position: "relative", width: W, height: H, background: C.background }}>
            <div style={{ position: "absolute", left: 300, top: 800 }}>
              <PromptBox
                width={480}
                value={typed(t, PROMPT, p.typeStart, p.cps)}
                focused={t >= p.click}
                caretOn={t < done || Math.floor((t - done) / 0.5) % 2 === 0}
                busy={t >= p.sendClick}
                t={t}
                chips={false}
              />
            </div>
          </div>
        </World>
        <Cursor t={t} path={promptPath} clicks={[p.click, p.sendClick]} cam={promptCam} W={W} H={H} size={CURSOR} />
      </>
    );
  } else if (t < 14.9) {
    scene = (
      <>
        <World cam={planCam} t={t}>
          <Workspace s={{ ...wsStateFor(t), dim: 0 }} />
        </World>
        <Cursor t={t} path={planPath} clicks={[T.plan.confirmClick]} cam={planCam} W={W} H={H} size={CURSOR} />
      </>
    );
  } else if (t < T.build.end) {
    scene = (
      <World cam={buildCam} t={t}>
        <TallCanvas s={wsStateFor(t)} />
      </World>
    );
  } else if (t < T.k2.end) {
    scene = <Kinetic t={t} start={T.k2.start} end={T.k2.end} text={T.k2.text} W={W} H={H} size={96} maxWidth={860} />;
  } else if (t < T.edit.end) {
    const s = wsStateFor(t);
    scene = (
      <>
        <World cam={editCam} t={t}>
          <TallCanvas s={s} />
        </World>
        <Cursor t={t} path={editPath} clicks={[T.edit.dbl1, T.edit.dbl2, T.edit.clickAway]} cam={editCam} W={W} H={H} size={CURSOR} />
        {s.toastIn > 0 ? (
          <div
            style={{
              position: "absolute",
              left: 486 - 210,
              top: 1360,
              width: 420,
              height: 76,
              borderRadius: 14,
              border: `1px solid ${C.toastBorder}`,
              background: C.toastBg,
              color: C.toastText,
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: "0 26px",
              boxSizing: "border-box",
              font: `500 26px/1 ${FONT.sans}`,
              opacity: s.toastIn,
              transform: `translateY(${(1 - s.toastIn) * 20}px)`,
            }}
          >
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            Saved
          </div>
        ) : null}
      </>
    );
  } else if (t < 30.75) {
    scene = (
      <>
        <World cam={menuCam} t={t}>
          <Workspace s={{ ...wsStateFor(t), dim: 0, dialog: null, toastIn: 0 }} />
        </World>
        <Cursor t={t} path={menuPath} clicks={[l.menuClick, l.itemClick]} cam={menuCam} W={W} H={H} size={CURSOR} />
      </>
    );
  } else if (t < l.end) {
    const dIn = Math.max(dialogIn(t), ramp(t, 30.75, 0.15));
    scene = (
      <>
        <World cam={dialogCam} t={t}>
          <div style={{ position: "relative", width: W, height: 2200, background: C.background }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
            <div style={{ position: "absolute", left: ND.x, top: ND.y, opacity: dIn, transform: `scale(${0.96 + 0.04 * dIn})`, transformOrigin: "50% 20%" }}>
              <StoreListingDialog width={ND.w} narrow busy={shotsBusy(t)} shots={shots(t)} t={t} />
            </div>
          </div>
        </World>
        <Cursor t={t} path={dialogPath(N_BTN_Y)} clicks={[l.shotsClick]} cam={dialogCam} W={W} H={H} size={CURSOR} />
      </>
    );
  } else {
    scene = <Lockup t={t} start={T.close.start} W={W} H={H} scale={1.6} />;
  }
  return <AbsoluteFill style={{ background: C.stage, overflow: "hidden" }}>{scene}</AbsoluteFill>;
};

export const _unused = workspaceState;
