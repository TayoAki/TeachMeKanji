// TEMPLATE FILE — owned by the platform, never written by the model.
// Lottie animations, drawn in the app's own theme colors: "success" (a check that pops in),
// "confetti" (a burst), "loading" (three bouncing dots), "heart" (a like that pops) and
// "sparkle" (a twinkle for premium). They're built here as Lottie JSON, so they need no files,
// and they follow Reduce Motion and still renders like the rest of components/motion.
// <Celebrate trigger={…} /> bursts confetti over a screen and taps the phone when a goal is met.
import LottieView from "lottie-react-native";
import { useEffect, useMemo, useRef, useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
import { haptic, useReducedMotion } from "./motion";

export type LottieName = "success" | "confetti" | "loading" | "heart" | "sparkle";

type Rgba = [number, number, number, number];
type Vec = number[];
interface Palette {
  main: Rgba;
  on: Rgba;
  pieces: Rgba[];
}

/** "#rrggbb" or "#rgb" to Lottie's 0–1 RGBA; anything else is a neutral grey. */
function rgba(color: string | undefined): Rgba {
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(color ?? "")?.[1];
  if (!hex) return [0.5, 0.5, 0.5, 1];
  const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
  const n = parseInt(full, 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255, 1];
}

const still = (k: unknown) => ({ a: 0, k });
const EASE = { i: { x: [0.25], y: [1] }, o: { x: [0.35], y: [0] } };
const POP = { i: { x: [0.3], y: [1.45] }, o: { x: [0.4], y: [0] } };
const LINEAR = { i: { x: [1], y: [1] }, o: { x: [0], y: [0] } };

/** An animated property: [frame, value] pairs, eased by `curve` between them. */
function keys(frames: Array<[number, Vec]>, curve: typeof EASE = EASE) {
  return {
    a: 1,
    k: frames.map(([t, s], i) => (i === frames.length - 1 ? { t, s } : { t, s, ...curve })),
  };
}

function group(items: unknown[], transform: { p?: Vec; r?: number } = {}) {
  return {
    ty: "gr",
    it: [
      ...items,
      {
        ty: "tr",
        p: still(transform.p ?? [0, 0]),
        a: still([0, 0]),
        s: still([100, 100]),
        r: still(transform.r ?? 0),
        o: still(100),
        sk: still(0),
        sa: still(0),
      },
    ],
  };
}
const ellipse = (w: number, h = w) => ({ ty: "el", p: still([0, 0]), s: still([w, h]), d: 1 });
const rect = (w: number, h: number, r = 0) => ({
  ty: "rc",
  p: still([0, 0]),
  s: still([w, h]),
  r: still(r),
  d: 1,
});
const fill = (c: Rgba) => ({ ty: "fl", c: still(c), o: still(100), r: 1 });
const stroke = (c: Rgba, w: number) => ({
  ty: "st",
  c: still(c),
  o: still(100),
  w: still(w),
  lc: 2,
  lj: 2,
});
const path = (v: Vec[], closed = false) => ({
  ty: "sh",
  ks: still({ i: v.map(() => [0, 0]), o: v.map(() => [0, 0]), v, c: closed }),
});
const trimEnd = (end: unknown) => ({ ty: "tm", s: still(0), e: end, o: still(0), m: 1 });

function layer(
  index: number,
  name: string,
  shapes: unknown[],
  op: number,
  ks: Record<string, unknown> = {},
) {
  return {
    ddd: 0,
    ind: index,
    ty: 4,
    nm: name,
    sr: 1,
    ks: {
      o: still(100),
      r: still(0),
      p: still([100, 100, 0]),
      a: still([0, 0, 0]),
      s: still([100, 100, 100]),
      ...ks,
    },
    ao: 0,
    shapes,
    ip: 0,
    op,
    st: 0,
    bm: 0,
  };
}

function animation(name: string, op: number, layers: unknown[], size = 200) {
  return { v: "5.7.4", fr: 60, ip: 0, op, w: size, h: size, nm: name, ddd: 0, assets: [], layers };
}

/** The same "random" layout every time, so a burst looks designed rather than noisy. */
function seeded(i: number): number {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function success(p: Palette) {
  const op = 60;
  return animation("success", op, [
    layer(
      1,
      "check",
      [
        group([
          path([
            [-30, 2],
            [-8, 24],
            [34, -20],
          ]),
          trimEnd(
            keys([
              [14, [0]],
              [34, [100]],
            ]),
          ),
          stroke(p.on, 13),
        ]),
      ],
      op,
    ),
    layer(2, "disc", [group([ellipse(150), fill(p.main)])], op, {
      s: keys(
        [
          [0, [0, 0, 100]],
          [16, [100, 100, 100]],
        ],
        POP,
      ),
    }),
    layer(3, "ring", [group([ellipse(150), stroke(p.main, 6)])], op, {
      s: keys([
        [10, [100, 100, 100]],
        [42, [140, 140, 100]],
      ]),
      o: keys([
        [10, [70]],
        [42, [0]],
      ]),
    }),
  ]);
}

function confetti(p: Palette) {
  const op = 100;
  const pieces = Array.from({ length: 22 }, (_, i) => {
    const angle = (i / 22) * Math.PI * 2 + seeded(i) * 0.5;
    const reach = 70 + seeded(i + 40) * 60;
    const x = 150 + Math.cos(angle) * reach;
    const y = 130 + Math.sin(angle) * reach - 30;
    const color = p.pieces[i % p.pieces.length]!;
    const shape = i % 3 === 0 ? ellipse(9) : rect(12, 7, 2);
    return layer(i + 1, `piece ${i}`, [group([shape, fill(color)])], op, {
      p: keys([
        [0, [150, 130, 0]],
        [26, [x, y, 0]],
        [op, [x + (seeded(i + 80) - 0.5) * 30, y + 120, 0]],
      ]),
      r: keys(
        [
          [0, [0]],
          [op, [(seeded(i + 120) > 0.5 ? 1 : -1) * (240 + seeded(i) * 300)]],
        ],
        LINEAR,
      ),
      s: keys(
        [
          [0, [0, 0, 100]],
          [8, [100, 100, 100]],
        ],
        POP,
      ),
      o: keys([
        [60, [100]],
        [op, [0]],
      ]),
    });
  });
  return animation("confetti", op, pieces, 300);
}

function loading(p: Palette) {
  const op = 60;
  return animation(
    "loading",
    op,
    [0, 1, 2].map((j) => {
      const d = j * 10;
      const frames: Array<[number, Vec]> = [
        [0, [60, 60, 100]],
        [d, [60, 60, 100]],
        [d + 15, [100, 100, 100]],
        [d + 30, [60, 60, 100]],
        [op, [60, 60, 100]],
      ];
      const unique = frames.filter((f, i) => i === 0 || f[0] !== frames[i - 1]![0]);
      return layer(j + 1, `dot ${j}`, [group([ellipse(24), fill(p.main)])], op, {
        p: still([60 + j * 40, 100, 0]),
        s: keys(unique),
      });
    }),
  );
}

function heart(p: Palette) {
  const op = 56;
  // A square turned 45° with a circle on each upper edge (centred on the edge's midpoint).
  const side = 46;
  const half = side / (2 * Math.SQRT2);
  const shape = group([
    group([ellipse(side), fill(p.main)], { p: [-half, 8 - half] }),
    group([ellipse(side), fill(p.main)], { p: [half, 8 - half] }),
    group([rect(side, side), fill(p.main)], { p: [0, 8], r: 45 }),
  ]);
  const dots = Array.from({ length: 6 }, (_, i) => {
    const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
    return layer(i + 3, `spark ${i}`, [group([ellipse(8), fill(p.pieces[i % 2]!)])], op, {
      p: keys([
        [8, [100, 100, 0]],
        [30, [100 + Math.cos(angle) * 72, 100 + Math.sin(angle) * 72, 0]],
      ]),
      o: keys([
        [8, [0]],
        [12, [100]],
        [30, [0]],
      ]),
    });
  });
  return animation("heart", op, [
    layer(1, "heart", [shape], op, {
      p: still([100, 104, 0]),
      s: keys(
        [
          [0, [0, 0, 100]],
          [14, [118, 118, 100]],
          [24, [100, 100, 100]],
        ],
        POP,
      ),
    }),
    layer(2, "ring", [group([ellipse(110), stroke(p.main, 5)])], op, {
      s: keys([
        [6, [60, 60, 100]],
        [30, [150, 150, 100]],
      ]),
      o: keys([
        [6, [80]],
        [30, [0]],
      ]),
    }),
    ...dots,
  ]);
}

function sparkle(p: Palette) {
  const op = 90;
  const star = (size: number) =>
    path(
      [
        [0, -size],
        [size * 0.22, -size * 0.22],
        [size, 0],
        [size * 0.22, size * 0.22],
        [0, size],
        [-size * 0.22, size * 0.22],
        [-size, 0],
        [-size * 0.22, -size * 0.22],
      ],
      true,
    );
  return animation("sparkle", op, [
    layer(1, "big", [group([star(54), fill(p.main)])], op, {
      s: keys([
        [0, [82, 82, 100]],
        [45, [104, 104, 100]],
        [op, [82, 82, 100]],
      ]),
      r: keys(
        [
          [0, [0]],
          [op, [90]],
        ],
        LINEAR,
      ),
    }),
    layer(2, "small", [group([star(20), fill(p.pieces[1] ?? p.main)])], op, {
      p: still([150, 52, 0]),
      s: keys([
        [0, [100, 100, 100]],
        [45, [55, 55, 100]],
        [op, [100, 100, 100]],
      ]),
    }),
  ]);
}

const BUILDERS: Record<LottieName, (p: Palette) => unknown> = {
  success,
  confetti,
  loading,
  heart,
  sparkle,
};
const LOOPS: Record<LottieName, boolean> = {
  success: false,
  confetti: false,
  loading: true,
  heart: false,
  sparkle: true,
};

/**
 * One of the platform's Lottie animations in the app's colors. `color` (a theme color) replaces
 * the main color, e.g. theme.colors.danger for a heart. Plays once, or loops for "loading" and
 * "sparkle" unless `loop` says otherwise.
 */
export function Lottie({
  name,
  size = 120,
  color,
  loop,
  style,
  onFinish,
}: {
  name: LottieName;
  size?: number;
  color?: string;
  loop?: boolean;
  style?: StyleProp<ViewStyle>;
  onFinish?: () => void;
}) {
  const theme = useTheme();
  const reduced = useReducedMotion();
  const source = useMemo(
    () =>
      BUILDERS[name]({
        main: rgba(color ?? theme.colors.primary),
        on: rgba(theme.colors.onPrimary),
        pieces: [
          rgba(theme.colors.primary),
          rgba(theme.colors.accent),
          rgba(theme.colors.success),
          rgba(theme.colors.warning),
        ],
      }) as object,
    [name, color, theme],
  );
  return (
    <LottieView
      source={source}
      autoPlay={!reduced}
      loop={!reduced && (loop ?? LOOPS[name])}
      // Reduce Motion and still renders show the finished animation.
      progress={reduced ? 1 : undefined}
      onAnimationFinish={(cancelled) => (cancelled ? undefined : onFinish?.())}
      style={[{ width: size, height: size }, style]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

/**
 * Confetti over the screen and a success tap on the phone each time `trigger` changes to a new
 * truthy value (a finished lesson, a goal met, a streak milestone). Put it last inside the
 * screen's root view; it never blocks taps.
 */
export function Celebrate({ trigger }: { trigger: unknown }) {
  const reduced = useReducedMotion();
  const [bursts, setBursts] = useState(0);
  const previous = useRef(trigger);
  useEffect(() => {
    if (trigger === previous.current) return;
    previous.current = trigger;
    if (!trigger) return;
    haptic("success");
    if (!reduced) setBursts((n) => n + 1);
  }, [trigger, reduced]);
  if (!bursts) return null;
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        bottom: 0,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Lottie key={bursts} name="confetti" size={360} onFinish={() => setBursts(0)} />
    </View>
  );
}
