/**
 * The timing map, in seconds. Every beat, click and arrival comes from here, so the 60 fps master,
 * the 30 fps animatic and the vertical share one film. There is no narration, so the beats are
 * timed to reading time (about 4 words per second) and the timing table in the Sizzle skill.
 */
export const PROMPT = "A kanji app: daily flashcards, a meaning quiz, progress from N5 to N1.";
export const EDIT_OLD = "Keep your small daily deck going all the way to N1";
export const EDIT_NEW = "Go all the way to N1";

export const T = {
  hook: { start: 0, end: 3.2 },
  k1: { start: 3.2, end: 4.6, text: "Describe your app idea." },
  prompt: {
    start: 4.6,
    click: 5.4,
    typeStart: 5.55,
    cps: 17,
    sendClick: 10.12,
    end: 10.3,
  },
  plan: { start: 10.3, cardIn: 10.45, confirmClick: 14.45 },
  build: { phonesStart: 15.6, phoneGap: 0.38, readyAt: 18.25, end: 20.8 },
  k2: { start: 20.8, end: 22.8, text: "Onboarding, paywall and settings, built in." },
  edit: {
    start: 22.8,
    dbl1: 25.05,
    dbl2: 25.18,
    typeStart: 25.45,
    cps: 15,
    clickAway: 27.25,
    end: 29.0,
  },
  listing: {
    start: 29.0,
    menuClick: 29.95,
    itemClick: 30.55,
    shotsClick: 33.35,
    shotsStart: 33.55,
    shotGap: 0.22,
    end: 36.8,
  },
  close: { start: 36.8, end: 40.5 },
} as const;

export const DURATION = T.close.end;

export const typed = (t: number, text: string, start: number, cps: number) =>
  t < start ? "" : text.slice(0, Math.min(text.length, Math.floor((t - start) * cps)));

export const typingDone = (text: string, start: number, cps: number) => start + text.length / cps;
