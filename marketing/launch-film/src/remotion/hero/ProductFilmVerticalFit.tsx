import React from "react";
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from "remotion";
import { FitSoundtrack } from "./audio";
import { C, FONT } from "./brand";
import { FIT_CUES } from "./fit";
import { inn, ramp } from "./motion";
import { ProductFilm } from "./ProductFilm";
import { T } from "./script";
import { dots } from "./ui/Workspace";

/**
 * TikTok/Reels "fit" cut (the user's preference over the recomposed v2): the approved 16:9 master
 * (composition ProductFilm), unchanged and uncropped, scaled to 1080 wide and placed a little above
 * center, with the text hook above it and burned-in captions below it.
 */
const W = 1080;
const H = 1920;
const K = W / 1920; // 0.5625
const VIDEO = { y: 576, h: 1080 * K }; // 576–1183.5
const HOOK_Y = 420;
const CAPTION = { y: 1228, h: 180 }; // ends at 1408, clear of the bottom 20% (1536)

function TextHook({ t }: { t: number }) {
  // From frame 0 until the lockup (36.8 s), so the end card stands alone.
  const o = 1 - ramp(t, T.close.start, 0.2, inn);
  if (o <= 0) return null;
  return (
    <div style={{ position: "absolute", left: 0, top: HOOK_Y, width: W, display: "flex", justifyContent: "center", opacity: o }}>
      <div
        style={{
          padding: "14px 28px",
          borderRadius: 20,
          background: C.card,
          border: `1px solid ${C.border}`,
          font: `600 54px/1.1 ${FONT.sans}`,
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

function Captions({ t }: { t: number }) {
  const cue = FIT_CUES.find((c) => t >= c.s && t < c.e);
  if (!cue) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: (W - 860) / 2,
        top: CAPTION.y,
        width: 860,
        height: CAPTION.h,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        whiteSpace: "pre-line",
        font: `600 52px/1.2 ${FONT.sans}`,
        letterSpacing: "-0.01em",
        color: C.foreground,
        opacity: cue.s === 0 ? 1 : ramp(t, cue.s, 0.08),
        textShadow: "0 2px 12px rgba(0,0,0,0.6)",
      }}
    >
      {cue.text}
    </div>
  );
}

export const ProductFilmVerticalFit: React.FC<{ music?: "lift" | "launchpad" }> = ({ music = "lift" }) => {
  const t = useCurrentFrame() / useVideoConfig().fps;
  return (
    <AbsoluteFill style={{ background: C.background, ...dots }}>
      <div
        style={{
          position: "absolute",
          left: 0,
          top: VIDEO.y,
          width: 1920,
          height: 1080,
          transform: `scale(${K})`,
          transformOrigin: "0 0",
          overflow: "hidden",
        }}
      >
        <ProductFilm />
      </div>
      {/* a hairline so the picture's dark edges read against the dark page */}
      <div style={{ position: "absolute", left: 0, top: VIDEO.y - 1, width: W, height: VIDEO.h + 2, borderTop: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, pointerEvents: "none" }} />
      <TextHook t={t} />
      <Captions t={t} />
      <FitSoundtrack music={music} />
    </AbsoluteFill>
  );
};

/** The 16:9 master's sound only (the same 40.5 s mix), for muxing onto the existing master video. */
export const MasterSoundtrack: React.FC = () => <FitSoundtrack music="lift" />;
