/**
 * The TikTok/Reels "fit" cut: the approved 16:9 master's picture in a 9:16 frame, with the
 * narration re-placed on the master's story beats. Each phrase is cut from vo_master.wav in the
 * middle of a measured silence (speed and pitch unchanged) and placed so its first word starts at
 * `at` (film time). Cue and speech times are relative to the phrase's first word.
 */
import { BEAT } from "./vo";

export interface Phrase {
  /** Source clip in vo_master.wav (s), cut inside silences. */
  clip: [number, number];
  /** Source time of the phrase's first word. */
  first: number;
  /** Film time of the first word. */
  at: number;
  /** Speech segments, source times. */
  speech: Array<[number, number]>;
  /** Caption cues, source times. */
  cues: Array<{ s: number; e: number; text: string }>;
}

export const PHRASES: Phrase[] = [
  {
    // hook (0–3.2): "the paywall" while the camera pulls back from the paywall
    clip: [0.0, 5.66],
    first: 0.0,
    at: 0.1,
    speech: [[0.0, 3.62], [4.27, 5.18]],
    cues: [
      { s: 0.0, e: 3.62, text: "What if your app idea\ncame with the paywall…" },
      { s: 4.27, e: 5.18, text: "already built?" },
    ],
  },
  {
    // prompt (4.6–10.3): "Describe" as the typing starts (5.55)
    clip: [5.66, 9.12],
    first: 6.15,
    at: 5.6,
    speech: [[6.15, 7.53], [7.69, 8.68]],
    cues: [{ s: 6.15, e: 8.68, text: "Describe your app idea,\nthe way you'd tell a friend." }],
  },
  {
    // plan (10.3–14.6): "plan" as the card arrives (10.45); "premium costs" on the prices hold (12.6–13.5)
    clip: [9.12, 14.1],
    first: 9.55,
    at: 9.9,
    speech: [[9.55, 10.04], [10.21, 10.9], [11.38, 12.17], [12.39, 13.85]],
    cues: [
      { s: 9.55, e: 10.9, text: "First, you get a plan:" },
      { s: 11.38, e: 13.85, text: "every screen…\nand what premium costs." },
    ],
  },
  {
    // build (14.6–20.8): "Then it builds" on the pull-back; "onboarding / a paywall / settings" as the
    // frames arrive (onboarding 15.6, paywall 15.98, settings 17.88) and on the canvas hold
    clip: [14.1, 20.54],
    first: 14.34,
    at: 14.75,
    speech: [[14.34, 15.76], [16.16, 20.12]],
    cues: [
      { s: 14.34, e: 15.76, text: "Then it builds the real app —" },
      { s: 16.16, e: 19.08, text: "onboarding, a paywall with\nrestore and renewal terms," },
      { s: 19.08, e: 20.12, text: "and settings." },
    ],
  },
  {
    // edit (22.8–29.0): "Double-click it" on the double-click (25.05); "free" after "Saved" (27.37)
    clip: [20.54, 25.69],
    first: 20.96,
    at: 23.85,
    speech: [[20.96, 21.83], [22.16, 22.68], [22.95, 23.43], [24.21, 25.39]],
    cues: [
      { s: 20.96, e: 21.83, text: "Don't like a headline?" },
      { s: 22.16, e: 23.43, text: "Double-click it and type." },
      { s: 24.21, e: 25.39, text: "Your own edits are free." },
    ],
  },
  {
    // listing (29.0–36.8): "store listing" on the dialog; "frames" on the Make screenshots click (33.35)
    clip: [25.69, 30.85],
    first: 25.98,
    at: 31.11,
    speech: [[25.98, 27.8], [27.99, 30.44]],
    cues: [
      { s: 25.98, e: 27.8, text: "It even writes your\nstore listing…" },
      { s: 27.99, e: 30.44, text: "and frames your screenshots\nfor both stores." },
    ],
  },
  {
    // close (36.8–40.5): "App Builder" as the lockup lands; "Start free" as the CTA shows (37.55–37.95)
    clip: [30.85, 33.88],
    first: 31.26,
    at: 36.9,
    speech: [[31.26, 31.87], [32.28, 33.64]],
    cues: [
      { s: 31.26, e: 31.87, text: "App Builder." },
      { s: 32.28, e: 33.64, text: "Start free with\na hundred credits." },
    ],
  },
];

const shift = (p: Phrase) => p.at - p.first;

export const FIT_SPEECH: Array<[number, number]> = PHRASES.flatMap((p) =>
  p.speech.map(([s, e]) => [s + shift(p), e + shift(p)] as [number, number]),
);
export const FIT_LAST_WORD = FIT_SPEECH[FIT_SPEECH.length - 1][1];

/** The master's kinetic-type cards: no caption holds into them when nothing is being said. */
const CARDS: Array<[number, number]> = [
  [3.2, 4.6],
  [20.8, 22.8],
];

/**
 * Captions in film time; each cue holds up to 0.5 s after its last word or until the next cue, but a
 * hold never runs into a kinetic card (the words themselves may).
 */
export const FIT_CUES: Array<{ s: number; e: number; text: string }> = (() => {
  const flat = PHRASES.flatMap((p) => p.cues.map((c) => ({ s: c.s + shift(p), e: c.e + shift(p), text: c.text })));
  return flat.map((c, i) => {
    let e = Math.min(c.e + 0.5, flat[i + 1]?.s ?? Infinity);
    for (const [a, b] of CARDS) if (e > a && c.e < b) e = Math.max(c.e, Math.min(e, a));
    return { ...c, e };
  });
})();

/** Clip placements: where each source clip starts in the film. */
export const FIT_CLIPS = PHRASES.map((p) => ({ src: p.clip, start: p.clip[0] + shift(p) }));

/**
 * Music: the drop (file 102.98 s) lands on "Ready" at the end of the build (18.25 s); the hit
 * (119.676 s) lands at 34.95 s on the screenshots payoff hold; the file ends at 40.09 s, inside the
 * master's 40.5 s, after its ring-out (inaudible by ~39.6 s).
 */
export const FIT_MUSIC_OFFSET = 102.98 - 18.25;
export const FIT_BEAT = BEAT;
