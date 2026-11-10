import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { Soundtrack } from "./audio";
import { C, FONT, R } from "./brand";
import { Cursor, type Waypoint } from "./cursor";
import { loadFonts } from "./fonts";
import { camTransform, cameraAt, inn, ramp, type CamKey } from "./motion";
import { EDIT_NEW, PROMPT, typed } from "./script";
import { CUES, HIT } from "./vo";
import { PromptBox } from "./ui/PromptBox";
import { StoreListingDialog } from "./ui/StoreListing";
import { Lockup } from "./ui/Type";
import { CanvasFrames, Workspace, dots, type WorkspaceState } from "./ui/Workspace";

loadFonts();

/**
 * 9:16 v2, cut to the narration. Layout: a text-hook band (110–290), a rounded content window
 * (x 30–970, y 310–1290) the camera works inside, and a caption band (1316–1510). The bottom 20%
 * and the right 10% stay clear for the platform's UI.
 */
const W = 1080;
const H = 1920;
const WIN = { x: 30, y: 310, w: 940, h: 980 };
const CURSOR = 50;

// ---- Timeline (s), from the narration's words (vo.ts) and the music grid ----
export const V = {
  hookEnd: 5.984, // beat before "Describe" (6.15)
  promptClick: 6.2,
  typeStart: 6.32,
  typeCps: 24,
  send: 9.42,
  planStart: 9.55, // "First, you get a plan"
  planIn: 9.6,
  tiltStart: 11.38, // "every screen"
  tiltEnd: 12.17,
  prices: 12.39, // "and what premium costs"
  confirmCut: 13.86,
  confirmClick: 14.05,
  build: 14.34, // "Then it builds the real app"
  phonesStart: 14.36,
  phoneGap: 0.12,
  drop: 14.53, // music drop: the pull-back starts here
  ready: 15.2,
  onboarding: 16.13, // beat, "onboarding" 16.16
  paywallBottom: 17.0, // "a paywall with restore and renewal terms"
  settings: 19.337, // beat, inside "and settings"
  edit: 20.94, // beat, "Don't like a headline?" 20.96
  dbl1: 22.18, // "Double-click it"
  dbl2: 22.3,
  editType: 22.95, // "and type"
  editCps: 20,
  clickAway: 24.25, // "Your own edits are free"
  menu: 25.746, // beat, before "It even writes your store listing" 25.98
  menuClick: 25.98,
  itemClick: 26.45,
  dialog: 26.6,
  buttons: 27.882, // beat, before "and frames your screenshots" 27.99
  shotsClick: 27.99,
  shotsStart: 28.08,
  shotGap: 0.07,
  big: [28.417, 28.951, 29.485, 30.019, 30.553], // beats
  close: HIT, // 31.226, the hit, on "App Builder" 31.26
};

// ---- Canvas world (4 columns, so the one marquee shows all 7 large enough) ----
const CL = { cols: 4, phoneW: 211, gapX: 24, gapY: 30, labelScale: 1.2, x0: 50, y0: 300 };
const PW = CL.phoneW;
const PH = PW * (2406 / 1113);
const LH = 28 * CL.labelScale;
const fk = PW / 390;
const phone = (i: number) => ({
  x: CL.x0 + (i % 4) * (PW + CL.gapX),
  y: CL.y0 + Math.floor(i / 4) * (PH + LH + CL.gapY) + LH,
});
/** World point at (frame px) inside phone i's capture. */
const at = (i: number, fx: number, fy: number) => ({ x: phone(i).x + fx * fk, y: phone(i).y + fy * fk });
const center = (i: number, fy: number, s: number) => ({ x: phone(i).x + PW / 2, y: at(i, 0, fy).y, s });

function CanvasWorld({ s, srcFor }: { s: WorkspaceState; srcFor?: (i: number) => string | undefined }) {
  return (
    <div style={{ position: "relative", width: W, height: 1500, background: C.background, ...dots }}>
      <CanvasFrames s={s} x0={CL.x0} y0={CL.y0} layout={CL} srcFor={srcFor} />
    </div>
  );
}

// ---- Product state for v2 (from V only) ----
function stateAt(t: number): WorkspaceState {
  const typingEnds = V.editType + EDIT_NEW.length / V.editCps;
  const built = Array.from({ length: 7 }, (_, i) => (t >= V.phonesStart + i * V.phoneGap ? 1 : 0)).reduce(
    (a: number, b: number) => a + b,
    0,
  );
  return {
    t,
    userMessage: t >= V.planStart - 0.1,
    planIn: ramp(t, V.planIn, 0.3),
    confirmBusy: t >= V.confirmClick && t < V.ready,
    composerPlaceholder: t >= V.ready ? "Describe a change…" : "Ask for changes to the plan…",
    building: t >= V.confirmClick + 0.08 && t < V.ready,
    step: built === 0 ? "Designing the theme, data and shared components" : `Built ${built} of 7 screens`,
    phones: Array.from({ length: 7 }, (_, i) => ramp(t, V.phonesStart + i * V.phoneGap, 0.2)),
    readyIn: ramp(t, V.ready, 0.3),
    version: t >= V.ready ? (t >= V.clickAway + 0.1 ? 2 : 1) : null,
    edit: {
      phase: t < V.dbl2 + 0.04 ? "none" : t < V.editType ? "selected" : t < V.clickAway ? "typing" : "done",
      text: typed(t, EDIT_NEW, V.editType, V.editCps),
      caretOn: t < typingEnds || Math.floor((t - typingEnds) / 0.5) % 2 === 0,
    },
    menuIn: t < V.itemClick + 0.05 ? ramp(t, V.menuClick + 0.03, 0.12) : 1 - ramp(t, V.itemClick + 0.05, 0.1, inn),
    menuHover: t >= V.itemClick - 0.15,
    dialog: null,
    toastIn: 0,
    dim: 0,
    focus: null,
  };
}
const BUILT_PRE_EDIT = 20.0;

// ---- Cameras (world coordinates, viewed through the window) ----
const hookCam: CamKey[] = [
  { t: 0, ...center(1, 300, 3.8) },
  { t: 3.6, ...center(1, 560, 4.0) },
  { t: V.hookEnd, ...center(1, 560, 4.0) },
];
const promptCam: CamKey[] = [
  { t: V.hookEnd, x: 540, y: 905, s: 1.85 },
  { t: 6.15, x: 540, y: 905, s: 1.95 },
  { t: V.planStart, x: 540, y: 905, s: 1.95 },
];
const planCam: CamKey[] = [
  { t: V.planStart, x: 200, y: 350, s: 3.13 },
  { t: V.tiltStart, x: 200, y: 350, s: 3.13 },
  { t: V.tiltEnd, x: 200, y: 690, s: 3.13 },
  { t: V.prices - 0.001, x: 200, y: 690, s: 3.13 },
  { t: V.prices, x: 216, y: 362, s: 3.6 },
  { t: V.confirmCut - 0.001, x: 220, y: 370, s: 3.75 },
  { t: V.confirmCut, x: 200, y: 790, s: 3.13 },
  { t: V.build, x: 200, y: 790, s: 3.13 },
];
const buildCam: CamKey[] = [
  { t: V.build, x: 400, y: 600, s: 1.25 },
  { t: V.drop, x: 404, y: 602, s: 1.24 },
  { t: 15.45, x: 508, y: 813, s: 0.92 },
  { t: V.onboarding - 0.001, x: 508, y: 813, s: 0.92 },
  // the four parts, one phone at a time, cut on the words
  { t: V.onboarding, ...center(0, 340, 4.0) },
  { t: V.paywallBottom - 0.001, ...center(0, 360, 4.05) },
  { t: V.paywallBottom, ...center(1, 660, 4.0) },
  { t: V.settings - 0.001, ...center(1, 670, 4.05) },
  { t: V.settings, ...center(6, 270, 4.0) },
  { t: V.edit - 0.001, ...center(6, 280, 4.05) },
  // the edit
  { t: V.edit, ...center(1, 250, 3.9) },
  { t: V.dbl1 - 0.2, ...center(1, 250, 4.1) },
  { t: V.menu, ...center(1, 250, 4.1) },
];
const menuCam: CamKey[] = [
  { t: V.menu, x: 200, y: 157, s: 3.13 },
  { t: V.dialog, x: 200, y: 157, s: 3.13 },
];
// Narrow dialog (DebugDialogNarrow): Promo ends at 701, Google Play field 714–800 (kept out of
// frame), buttons 1097–1168, screenshot cells 127×277 at x 336/476/617, y 1186/1476.
const ND = { x: 310, y: 300 };
const cell = (i: number) => ({ x: [400, 540, 681][i % 3], y: [1186, 1476][Math.floor(i / 3)] });
const dialogCam: CamKey[] = [
  { t: V.dialog, x: 540, y: 462, s: 2.0 },
  { t: V.buttons - 0.001, x: 540, y: 466, s: 2.02 },
  { t: V.buttons, x: 540, y: 1180, s: 2.0 },
  { t: V.big[0] - 0.001, x: 540, y: 1180, s: 2.0 },
  ...V.big.flatMap((b, i) => {
    const c = cell(i);
    const end = (V.big[i + 1] ?? V.close) - 0.001;
    return [
      { t: b, x: c.x, y: c.y + 84, s: 5.8 },
      { t: end, x: c.x, y: c.y + 86, s: 5.9 },
    ];
  }),
];

// ---- Cursor paths (world) ----
const promptPath: Waypoint[] = [
  { t: V.hookEnd, x: 760, y: 1200 },
  { t: 6.18, x: 380, y: 850, bow: 30 },
  { t: 6.35, x: 380, y: 850 },
  { t: 6.7, x: 700, y: 1060, bow: -20 },
  { t: 9.25, x: 700, y: 1060 },
  { t: 9.4, x: 755, y: 948, bow: 8 },
  { t: V.planStart, x: 755, y: 948 },
];
const confirmPath: Waypoint[] = [
  { t: V.confirmCut, x: 120, y: 950 },
  { t: 14.0, x: 216, y: 858, bow: 10 },
  { t: V.build, x: 216, y: 858 },
];
const headline = at(1, 150, 118);
const away = { x: phone(1).x + PW + 11, y: at(1, 0, 420).y };
const editPath: Waypoint[] = [
  { t: 21.6, x: phone(1).x - 60, y: at(1, 0, 520).y },
  { t: 22.12, x: headline.x, y: headline.y, bow: 20 },
  { t: 22.42, x: headline.x, y: headline.y },
  { t: 22.8, x: away.x, y: away.y, bow: -10 },
  { t: 24.15, x: away.x, y: away.y },
  { t: 24.24, x: away.x, y: away.y + 6 },
  { t: V.menu, x: away.x, y: away.y + 6 },
];
const menuPath: Waypoint[] = [
  { t: V.menu, x: 330, y: 70 },
  { t: 25.94, x: 318, y: 22, bow: 6 },
  { t: 26.1, x: 318, y: 22 },
  { t: 26.4, x: 230, y: 124, bow: 6 },
  { t: V.dialog, x: 230, y: 124 },
];
const makeShots = { x: 418, y: 1112 };
const buttonsPath: Waypoint[] = [
  { t: V.buttons, x: 560, y: 1150 },
  { t: 27.97, x: makeShots.x, y: makeShots.y, bow: 6 },
  { t: 28.1, x: makeShots.x, y: makeShots.y },
  { t: V.big[0], x: makeShots.x + 120, y: makeShots.y + 140, bow: -10 },
];

function Window({ cam, t, world, cursor }: { cam: CamKey[]; t: number; world: React.ReactNode; cursor?: React.ReactNode }) {
  return (
    <div
      style={{
        position: "absolute",
        left: WIN.x,
        top: WIN.y,
        width: WIN.w,
        height: WIN.h,
        overflow: "hidden",
        borderRadius: 28,
        border: `1px solid ${C.border}`,
        background: C.background,
      }}
    >
      <div style={{ position: "absolute", left: 0, top: 0, transformOrigin: "0 0", transform: camTransform(cameraAt(cam, t), WIN.w, WIN.h) }}>
        {world}
      </div>
      {cursor}
    </div>
  );
}

function Captions({ t }: { t: number }) {
  const cue = CUES.find((c) => t >= c.s && t < c.e);
  if (!cue) return null;
  // The first cue is on screen from frame 0 (the poster); later cues fade in over 80 ms.
  const a = cue.s === 0 ? 1 : ramp(t, cue.s, 0.08);
  return (
    <div
      style={{
        position: "absolute",
        left: WIN.x,
        top: 1316,
        width: WIN.w,
        height: 194,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        whiteSpace: "pre-line",
        font: `600 52px/1.2 ${FONT.sans}`,
        letterSpacing: "-0.01em",
        color: C.foreground,
        opacity: a,
        textShadow: "0 2px 12px rgba(0,0,0,0.6)",
      }}
    >
      {cue.text}
    </div>
  );
}

function TextHook({ t }: { t: number }) {
  if (t >= V.hookEnd) return null;
  return (
    <div style={{ position: "absolute", left: WIN.x, top: 120, width: WIN.w, display: "flex", justifyContent: "center" }}>
      <div
        style={{
          padding: "16px 28px",
          borderRadius: 22,
          background: C.card,
          border: `1px solid ${C.border}`,
          font: `600 60px/1.1 ${FONT.sans}`,
          letterSpacing: "-0.02em",
          color: C.foreground,
          textAlign: "center",
        }}
      >
        Your app idea, paywall included.
      </div>
    </div>
  );
}

function Toast({ t }: { t: number }) {
  const o = ramp(t, V.clickAway + 0.12, 0.25) * (1 - ramp(t, V.menu - 0.25, 0.2, inn));
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: WIN.x + WIN.w / 2 - 170,
        top: WIN.y + 28,
        width: 340,
        height: 72,
        borderRadius: R.lg + 4,
        border: `1px solid ${C.toastBorder}`,
        background: C.toastBg,
        color: C.toastText,
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "0 26px",
        boxSizing: "border-box",
        font: `500 28px/1 ${FONT.sans}`,
        opacity: o,
        transform: `translateY(${(1 - o) * -14}px)`,
        boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
      }}
    >
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="10" />
        <path d="m9 12 2 2 4-4" />
      </svg>
      Saved
    </div>
  );
}

export const ProductFilmVerticalV2: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const cur = (cam: CamKey[], path: Waypoint[], clicks: number[]) => (
    <Cursor t={t} path={path} clicks={clicks} cam={cam} W={WIN.w} H={WIN.h} size={CURSOR} />
  );

  let body: React.ReactNode;
  if (t < V.hookEnd) {
    body = <Window cam={hookCam} t={t} world={<CanvasWorld s={stateAt(BUILT_PRE_EDIT)} />} />;
  } else if (t < V.planStart) {
    const done = V.typeStart + PROMPT.length / V.typeCps;
    body = (
      <Window
        cam={promptCam}
        t={t}
        world={
          <div style={{ position: "relative", width: W, height: H, background: C.background }}>
            <div style={{ position: "absolute", left: 300, top: 800 }}>
              <PromptBox
                width={480}
                value={typed(t, PROMPT, V.typeStart, V.typeCps)}
                focused={t >= V.promptClick}
                caretOn={t < done || Math.floor((t - done) / 0.5) % 2 === 0}
                busy={t >= V.send}
                t={t}
                chips={false}
              />
            </div>
          </div>
        }
        cursor={cur(promptCam, promptPath, [V.promptClick, V.send])}
      />
    );
  } else if (t < V.build) {
    body = (
      <Window
        cam={planCam}
        t={t}
        world={<Workspace s={stateAt(t)} />}
        cursor={cur(planCam, confirmPath, [V.confirmClick])}
      />
    );
  } else if (t < V.menu) {
    const s = stateAt(t);
    const srcFor = (i: number) => (i === 1 && t >= V.paywallBottom && t < V.settings ? "app/paywall-bottom.png" : undefined);
    body = (
      <Window
        cam={buildCam}
        t={t}
        world={<CanvasWorld s={s} srcFor={srcFor} />}
        cursor={cur(buildCam, editPath, [V.dbl1, V.dbl2, V.clickAway])}
      />
    );
  } else if (t < V.dialog) {
    body = (
      <Window
        cam={menuCam}
        t={t}
        world={<Workspace s={stateAt(t)} />}
        cursor={cur(menuCam, menuPath, [V.menuClick, V.itemClick])}
      />
    );
  } else if (t < V.close) {
    const dIn = ramp(t, V.dialog, 0.15);
    const shots = Array.from({ length: 5 }, (_, i) => ramp(t, V.shotsStart + i * V.shotGap, 0.15));
    body = (
      <Window
        cam={dialogCam}
        t={t}
        world={
          <div style={{ position: "relative", width: W, height: 2200, background: C.background }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,0.5)" }} />
            <div style={{ position: "absolute", left: ND.x, top: ND.y, opacity: dIn, transform: `scale(${0.96 + 0.04 * dIn})`, transformOrigin: "50% 20%" }}>
              <StoreListingDialog
                width={460}
                narrow
                busy={t >= V.shotsClick && t < V.shotsStart + 4 * V.shotGap + 0.2}
                shots={shots}
                t={t}
              />
            </div>
          </div>
        }
        cursor={cur(dialogCam, buttonsPath, [V.shotsClick])}
      />
    );
  } else {
    body = <Lockup t={t} start={V.close} W={W} H={1300} scale={1.6} />;
  }

  return (
    <AbsoluteFill style={{ background: C.stage, ...dots, overflow: "hidden" }}>
      {body}
      <TextHook t={t} />
      <Toast t={t} />
      <Captions t={t} />
      <Soundtrack />
    </AbsoluteFill>
  );
};
