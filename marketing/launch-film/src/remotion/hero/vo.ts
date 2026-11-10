/**
 * Narration and music timing for the vertical (v2). Source: video/public/audio/vo.mp3 (ElevenLabs v3,
 * "Liam"), normalized to vo_master.wav (-16 LUFS, 70 Hz HPF, two-pass loudnorm). Word times from
 * faster-whisper small.en (out/audio/vo_words.json), corrected against silencedetect on the original
 * file (-35 dB, d = 0.15 s): whisper put "already" at 3.50 s, the speech gap says 4.27 s.
 * Caption text is the script as spoken ("a hundred", not whisper's "100").
 */
export const SPEECH: Array<[number, number]> = [
  [0.0, 3.62],
  [4.27, 5.18],
  [6.15, 7.53],
  [7.69, 8.68],
  [9.55, 10.04],
  [10.21, 10.9],
  [11.38, 12.17],
  [12.39, 13.85],
  [14.34, 15.76],
  [16.16, 20.12],
  [20.96, 21.83],
  [22.16, 22.68],
  [22.95, 23.43],
  [24.21, 25.39],
  [25.98, 27.8],
  [27.99, 30.44],
  [31.26, 31.87],
  [32.28, 33.64],
];
export const LAST_WORD_END = 33.64;

/** Caption cues: at most 2 lines of at most 32 characters, every spoken word kept. */
export const CUES: Array<{ s: number; e: number; text: string }> = [
  { s: 0.0, e: 3.95, text: "What if your app idea\ncame with the paywall…" },
  { s: 4.27, e: 5.7, text: "already built?" },
  { s: 6.15, e: 9.0, text: "Describe your app idea,\nthe way you'd tell a friend." },
  { s: 9.55, e: 11.2, text: "First, you get a plan:" },
  { s: 11.38, e: 14.1, text: "every screen…\nand what premium costs." },
  { s: 14.34, e: 15.95, text: "Then it builds the real app —" },
  { s: 16.16, e: 19.08, text: "onboarding, a paywall with\nrestore and renewal terms," },
  { s: 19.08, e: 20.5, text: "and settings." },
  { s: 20.96, e: 22.12, text: "Don't like a headline?" },
  { s: 22.16, e: 23.9, text: "Double-click it and type." },
  { s: 24.21, e: 25.85, text: "Your own edits are free." },
  { s: 25.98, e: 27.95, text: "It even writes your\nstore listing…" },
  { s: 27.99, e: 30.95, text: "and frames your screenshots\nfor both stores." },
  { s: 31.26, e: 32.22, text: "App Builder." },
  { s: 32.28, e: 34.4, text: "Start free with\na hundred credits." },
];

/**
 * Music: "Launchpad" (Suno), 112.35 BPM (beat 0.5341 s). The section start at 102.98 s in the file
 * (the drop into the loudest section) lands on the build pull-back at 14.53 s; then the hit at
 * 119.676 s lands at 31.226 s, on "App Builder" (31.26 s); the ring-out is inaudible by ~124.3 s.
 */
export const MUSIC_OFFSET = 88.45;
export const BEAT = 0.5341;
export const DROP = 102.98 - MUSIC_OFFSET; // 14.53
export const HIT = 119.676 - MUSIC_OFFSET; // 31.226
export const VDURATION = 36.0;
/** Beat k of the grid in film time (k = 0 is the drop). */
export const beat = (k: number) => DROP + k * BEAT;

/** Duck groups: speech merged across gaps shorter than 0.6 s. */
export function duckGroups(speech: Array<[number, number]> = SPEECH): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const [s, e] of speech) {
    const last = out[out.length - 1];
    if (last && s - last[1] < 0.6) last[1] = e;
    else out.push([s, e]);
  }
  return out;
}

/**
 * Music gain in dB at film time t (audio.md): -11 dB under speech with 120 ms attack and 400 ms
 * release; -5 dB in gaps longer than 0.6 s; -2 dB after the last word.
 */
export function musicDb(t: number, speech: Array<[number, number]> = SPEECH): number {
  const groups = duckGroups(speech);
  const UNDER = -11;
  const GAP = -5;
  const OUTRO = -2;
  const ATTACK = 0.12;
  const RELEASE = 0.4;
  let level = UNDER;
  for (let i = 0; i < groups.length; i++) {
    const [s, e] = groups[i];
    if (t >= s && t <= e) return UNDER;
    const next = groups[i + 1];
    const rest = next ? GAP : OUTRO;
    if (t > e && (!next || t < next[0])) {
      // released toward the rest level, then attacked back down before the next group
      const up = Math.min(1, (t - e) / RELEASE);
      level = UNDER + (rest - UNDER) * up;
      if (next && t > next[0] - ATTACK) {
        const down = (t - (next[0] - ATTACK)) / ATTACK;
        level = level + (UNDER - level) * Math.min(1, down);
      }
      return level;
    }
  }
  return level;
}
