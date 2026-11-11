/**
 * The promo film of a generated app (the Sizzle Product Film rails, automated):
 * - Hook: frame 0 is already moving and legible (it is also the poster), with the text hook.
 * - Work: one screen per beat; the camera shows it whole, pushes in on its focus and holds
 *   long enough to read the caption. No cursor: nothing is being operated, so none is faked.
 * - Escalate: one marquee pulls back to every screen side by side.
 * - Close: the app's name, its tagline and one call to action, held clean.
 * Every frame is a pure function of the frame number and the props.
 */
import type { CSSProperties, ReactNode } from "react";
import {
  AbsoluteFill,
  Audio,
  Easing,
  Img,
  interpolate,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {
  promoTimeline,
  type PromoColors,
  type PromoFocus,
  type PromoFormat,
  type PromoStoryboard,
} from "@appbuilder/contract/protocol";
import { useFonts } from "./fonts";

// A type alias (not an interface) so it satisfies Remotion's Record<string, unknown> props.
export type AppPromoProps = {
  format: PromoFormat;
  storyboard: PromoStoryboard;
  /** One image per beat, in order: paths in the bundle's public folder. */
  shots: string[];
  colors: PromoColors;
  appName: string;
  /** Optional music bed (the owner's own track), a path in the public folder. */
  music: string | null;
};

const PHONE_RATIO = 844 / 390;
const inOut = Easing.bezier(0.65, 0, 0.35, 1);
const out = Easing.bezier(0.16, 1, 0.3, 1);
const inn = Easing.bezier(0.7, 0, 0.84, 0);

function ramp(t: number, start: number, length: number, ease = out): number {
  return interpolate(t, [start, start + length], [0, 1], {
    easing: ease,
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
}

const FOCUS: Record<PromoFocus, number> = { top: 0.27, middle: 0.5, bottom: 0.73 };

interface Layout {
  /** The stage the phone lives in (clipped), in frame pixels. */
  stage: { x: number; y: number; width: number; height: number };
  /** How far the camera pushes in on a screen's focus. */
  push: number;
}

function layoutFor(format: PromoFormat, width: number, height: number): Layout {
  return format === "vertical"
    ? // Hook band above, caption band below; the bottom 20% stays clear for platform UI.
      { stage: { x: 0, y: 352, width, height: 948 }, push: 1.72 }
    : { stage: { x: width * 0.52, y: 70, width: width * 0.44, height: height - 140 }, push: 1.55 };
}

export function AppPromo(props: AppPromoProps) {
  useFonts();
  const frame = useCurrentFrame();
  const { fps, width, height, durationInFrames } = useVideoConfig();
  const t = frame / fps;
  const { storyboard, colors, format } = props;
  const timeline = promoTimeline(storyboard);
  const layout = layoutFor(format, width, height);
  const vertical = format === "vertical";
  const closeIn = ramp(t, timeline.close.start, 0.5, inOut);
  const total = durationInFrames / fps;

  return (
    <AbsoluteFill style={{ backgroundColor: colors.background, fontFamily: "Geist, sans-serif" }}>
      <Backdrop colors={colors} vertical={vertical} />

      {/* The screens: beats, then the marquee. */}
      <AbsoluteFill style={{ opacity: 1 - closeIn }}>
        <Stage layout={layout}>
          {storyboard.beats.map((beat, i) => (
            <BeatPhone
              key={i}
              index={i}
              t={t}
              shot={props.shots[i] ?? ""}
              focus={beat.focus}
              timeline={timeline}
              layout={layout}
              colors={colors}
            />
          ))}
        </Stage>
        <Marquee t={t} shots={props.shots} timeline={timeline} width={width} height={height} />
      </AbsoluteFill>

      {/* Words get their own place: never over the playing screen. */}
      {vertical ? (
        <VerticalText {...props} t={t} timeline={timeline} fade={1 - closeIn} />
      ) : (
        <LandscapeText {...props} t={t} timeline={timeline} fade={1 - closeIn} />
      )}

      <Close {...props} t={t} start={timeline.close.start} vertical={vertical} />

      {props.music ? (
        <Audio
          src={staticFile(props.music)}
          volume={(f) => {
            const s = f / fps;
            return 0.85 * ramp(s, 0, 0.3, out) * (1 - ramp(s, total - 1.4, 1.4, inn));
          }}
        />
      ) : null}
    </AbsoluteFill>
  );
}

function Backdrop({ colors, vertical }: { colors: PromoColors; vertical: boolean }) {
  return (
    <AbsoluteFill
      style={{
        background: `radial-gradient(${vertical ? "120% 70% at 85% 8%" : "70% 120% at 80% 20%"}, ${colors.primary}40, transparent 62%), radial-gradient(90% 60% at 10% 100%, ${colors.primary}26, transparent 70%)`,
      }}
    />
  );
}

function Stage({ layout, children }: { layout: Layout; children: ReactNode }) {
  const { stage } = layout;
  // Soft top and bottom edges, so a pushed-in screen never cuts hard against the text bands.
  const mask =
    "linear-gradient(to bottom, transparent 0, #000 36px, #000 calc(100% - 36px), transparent 100%)";
  return (
    <div
      style={{
        position: "absolute",
        left: stage.x,
        top: stage.y,
        width: stage.width,
        height: stage.height,
        overflow: "hidden",
        WebkitMaskImage: mask,
        maskImage: mask,
      }}
    >
      {children}
    </div>
  );
}

/** One beat's phone: enters, shows whole, pushes in on its focus, holds, then leaves. */
function BeatPhone({
  index,
  t,
  shot,
  focus,
  timeline,
  layout,
  colors,
}: {
  index: number;
  t: number;
  shot: string;
  focus: PromoFocus;
  timeline: ReturnType<typeof promoTimeline>;
  layout: Layout;
  colors: PromoColors;
}) {
  const beat = timeline.beats[index]!;
  const transition = 0.42;
  const last = index === timeline.beats.length - 1;
  const end = last ? timeline.marquee.start + 0.5 : beat.end;
  if (t < beat.start - 0.01 || t > end + transition) return null;

  const { stage } = layout;
  const phoneHeight = stage.height * 0.92;
  const phoneWidth = phoneHeight / PHONE_RATIO;
  const local = t - beat.start;

  // Camera: whole screen first, then push in on the focus and hold (the first beat starts moving
  // from frame 0, so the poster frame is never static or empty).
  const settle = index === 0 ? ramp(local, 0, 0.6, out) : 1;
  // The first beat opens already part-way in, so the poster frame shows a big, readable screen.
  const push =
    index === 0
      ? 0.4 + 0.6 * ramp(local, 0.25, 1.1, inOut)
      : ramp(local, transition + 0.3, 0.95, inOut);
  const scale = (index === 0 ? 0.94 + 0.06 * settle : 1) * (1 + (layout.push - 1) * push);
  const offset = (FOCUS[focus] - 0.5) * phoneHeight * scale;
  const maxShift = Math.max(0, (phoneHeight * scale - stage.height) / 2 + 24);
  const shiftY = -Math.max(-maxShift, Math.min(maxShift, offset)) * push;

  // Beat changes: the next screen slides in from the right as this one leaves to the left.
  const enter = index === 0 ? 1 : ramp(local, 0, transition, inOut);
  const leaving = last ? 0 : ramp(t, beat.end, transition, inOut);
  const x = (1 - enter) * stage.width * 0.9 - leaving * stage.width * 0.9;
  const y = index === 0 ? (1 - settle) * 60 : 0;
  // The last screen hands over to the marquee by pulling back and fading.
  const handover = last ? ramp(t, timeline.marquee.start, 0.5, inOut) : 0;

  return (
    <div
      style={{
        position: "absolute",
        left: stage.width / 2 - phoneWidth / 2,
        top: stage.height / 2 - phoneHeight / 2,
        width: phoneWidth,
        height: phoneHeight,
        transform: `translate(${x}px, ${y + shiftY * (1 - handover)}px) scale(${scale * (1 - 0.45 * handover)})`,
        opacity: 1 - handover,
      }}
    >
      <Phone shot={shot} width={phoneWidth} colors={colors} />
    </div>
  );
}

function Phone({ shot, width, colors }: { shot: string; width: number; colors: PromoColors }) {
  const bezel = width * 0.03;
  const style: CSSProperties = {
    width,
    height: width * PHONE_RATIO,
    borderRadius: width * 0.14,
    padding: bezel,
    background: "linear-gradient(160deg, #3a3a40, #0d0d10 40%, #1c1c21)",
    boxShadow: `0 ${width * 0.06}px ${width * 0.16}px rgba(0,0,0,0.45), 0 0 0 ${width * 0.004}px rgba(255,255,255,0.18) inset`,
    boxSizing: "border-box",
  };
  return (
    <div style={style}>
      <div
        style={{
          width: "100%",
          height: "100%",
          borderRadius: width * 0.115,
          overflow: "hidden",
          backgroundColor: colors.surface,
        }}
      >
        {shot ? (
          <Img
            src={staticFile(shot)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
          />
        ) : null}
      </div>
    </div>
  );
}

/** The one marquee: every screen side by side, arriving left to right. */
function Marquee({
  t,
  shots,
  timeline,
  width,
  height,
}: {
  t: number;
  shots: string[];
  timeline: ReturnType<typeof promoTimeline>;
  width: number;
  height: number;
}) {
  const { start, end } = timeline.marquee;
  if (t < start || t > end + 0.6) return null;
  const vertical = height > width;
  const n = shots.length;
  const gap = vertical ? 28 : 40;
  const maxWidth = vertical ? width * 0.92 : width * 0.82;
  const phoneWidth = Math.min((maxWidth - gap * (n - 1)) / n, vertical ? 300 : 300);
  const phoneHeight = phoneWidth * PHONE_RATIO;
  const rowWidth = n * phoneWidth + (n - 1) * gap;
  const top = vertical ? 352 + (948 - phoneHeight) / 2 : (height - phoneHeight) / 2;
  const leave = ramp(t, end - 0.1, 0.5, inOut);
  return (
    <>
      {shots.map((shot, i) => {
        const arrive = ramp(t, start + 0.15 + i * 0.09, 0.55, out);
        // The payoff (the last screen) sits a little forward.
        const lift = i === n - 1 ? 1.06 : 1;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: (width - rowWidth) / 2 + i * (phoneWidth + gap),
              top,
              width: phoneWidth,
              height: phoneHeight,
              opacity: arrive * (1 - leave),
              transform: `translateY(${(1 - arrive) * 90}px) scale(${(0.92 + 0.08 * arrive) * lift})`,
            }}
          >
            <Phone
              shot={shot}
              width={phoneWidth}
              colors={{
                background: "",
                surface: "#111",
                text: "",
                textMuted: "",
                primary: "",
                onPrimary: "",
              }}
            />
          </div>
        );
      })}
    </>
  );
}

/** Kinetic type: rises in, holds for the read, drops out. */
function Line({
  t,
  start,
  end,
  children,
  style,
}: {
  t: number;
  start: number;
  end: number;
  children: ReactNode;
  style: CSSProperties;
}) {
  if (t < start || t > end) return null;
  const shown = ramp(t, start, 0.42, out) * (1 - ramp(t, end - 0.3, 0.3, inn));
  return (
    <div style={{ ...style, opacity: shown, transform: `translateY(${(1 - shown) * 26}px)` }}>
      {children}
    </div>
  );
}

function VerticalText({
  storyboard,
  colors,
  t,
  timeline,
  fade,
}: AppPromoProps & { t: number; timeline: ReturnType<typeof promoTimeline>; fade: number }) {
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      {/* The text hook: on screen from frame 0, at full strength (frame 0 is the poster). */}
      <div
        style={{
          position: "absolute",
          left: 70,
          right: 70,
          top: 112,
          height: 220,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          color: colors.text,
          fontWeight: 700,
          fontSize: 78,
          lineHeight: 1.06,
          letterSpacing: -1.5,
          textWrap: "balance",
        }}
      >
        {storyboard.hook}
      </div>
      {/* Captions: their own band under the phone, never over it. */}
      {storyboard.beats.map((beat, i) => {
        const segment = timeline.beats[i]!;
        return (
          <Line
            key={i}
            t={t}
            start={segment.start + (i === 0 ? 0.35 : 0.3)}
            end={segment.end}
            style={{
              position: "absolute",
              left: 80,
              right: 80,
              top: 1322,
              height: 190,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              color: colors.text,
              fontWeight: 600,
              fontSize: 58,
              lineHeight: 1.12,
              letterSpacing: -0.8,
              textWrap: "balance",
            }}
          >
            {beat.caption}
          </Line>
        );
      })}
    </AbsoluteFill>
  );
}

function LandscapeText({
  storyboard,
  colors,
  appName,
  t,
  timeline,
  fade,
}: AppPromoProps & { t: number; timeline: ReturnType<typeof promoTimeline>; fade: number }) {
  const left = 150;
  const width = 780;
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <div
        style={{
          position: "absolute",
          left,
          top: 120,
          display: "flex",
          alignItems: "center",
          gap: 18,
          color: colors.textMuted,
          fontWeight: 600,
          fontSize: 34,
        }}
      >
        <Tile appName={appName} size={56} colors={colors} />
        {appName}
      </div>
      {/* The hook leads the first beat; later beats lead with their caption. */}
      <div
        style={{
          position: "absolute",
          left,
          width,
          top: 300,
          color: colors.text,
          fontWeight: 700,
          fontSize: 84,
          lineHeight: 1.04,
          letterSpacing: -2,
          opacity: 1 - ramp(t, timeline.beats[0]!.end - 0.3, 0.3, inn),
          textWrap: "balance",
        }}
      >
        {storyboard.hook}
      </div>
      {storyboard.beats.map((beat, i) => {
        const segment = timeline.beats[i]!;
        const first = i === 0;
        return (
          <Line
            key={i}
            t={t}
            start={segment.start + (first ? 0.6 : 0.3)}
            end={segment.end}
            style={{
              position: "absolute",
              left,
              width,
              top: first ? 640 : 380,
              color: first ? colors.textMuted : colors.text,
              fontWeight: first ? 500 : 700,
              fontSize: first ? 48 : 76,
              lineHeight: 1.1,
              letterSpacing: first ? -0.5 : -1.6,
              textWrap: "balance",
            }}
          >
            {first ? null : (
              <div
                style={{
                  color: colors.primary,
                  fontSize: 30,
                  fontWeight: 600,
                  letterSpacing: 2,
                  marginBottom: 22,
                }}
              >
                {String(i + 1).padStart(2, "0")}
              </div>
            )}
            {beat.caption}
          </Line>
        );
      })}
    </AbsoluteFill>
  );
}

function Tile({ appName, size, colors }: { appName: string; size: number; colors: PromoColors }) {
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.24,
        backgroundColor: colors.primary,
        color: colors.onPrimary,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontWeight: 700,
        fontSize: size * 0.5,
      }}
    >
      {Array.from(appName.trim())[0]?.toUpperCase() ?? "A"}
    </div>
  );
}

/** The close: the app's lockup, its tagline and one call to action, held clean. */
function Close({
  storyboard,
  colors,
  appName,
  t,
  start,
  vertical,
}: AppPromoProps & { t: number; start: number; vertical: boolean }) {
  if (t < start) return null;
  const wipe = ramp(t, start, 0.5, inOut);
  const lockup = ramp(t, start + 0.25, 0.5, out);
  const line = ramp(t, start + 0.5, 0.45, out);
  const cta = ramp(t, start + 0.75, 0.45, out);
  const scale = vertical ? 1 : 0.9;
  return (
    <AbsoluteFill
      style={{
        backgroundColor: colors.primary,
        clipPath: `inset(${(1 - wipe) * 100}% 0 0 0)`,
        alignItems: "center",
        justifyContent: "center",
        color: colors.onPrimary,
        textAlign: "center",
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 34 * scale,
          transform: `scale(${scale})`,
          marginTop: vertical ? -160 : 0,
        }}
      >
        <div
          style={{
            opacity: lockup,
            transform: `translateY(${(1 - lockup) * 30}px)`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 30,
          }}
        >
          <Tile
            appName={appName}
            size={150}
            colors={{ ...colors, primary: colors.onPrimary, onPrimary: colors.primary }}
          />
          <div style={{ fontWeight: 700, fontSize: 104, letterSpacing: -2.5, lineHeight: 1 }}>
            {appName}
          </div>
        </div>
        {storyboard.tagline ? (
          <div
            style={{
              opacity: line * 0.9,
              transform: `translateY(${(1 - line) * 24}px)`,
              fontWeight: 500,
              fontSize: 50,
              maxWidth: 880,
              lineHeight: 1.15,
              textWrap: "balance",
            }}
          >
            {storyboard.tagline}
          </div>
        ) : null}
        <div
          style={{
            opacity: cta,
            transform: `translateY(${(1 - cta) * 24}px)`,
            marginTop: 16,
            padding: "26px 52px",
            borderRadius: 999,
            backgroundColor: colors.onPrimary,
            color: colors.primary,
            fontWeight: 600,
            fontSize: 44,
          }}
        >
          {storyboard.cta}
        </div>
      </div>
    </AbsoluteFill>
  );
}
