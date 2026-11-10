/** Scenario data: the real Kanjiwa project on production (evidence/v3-info.json), shortened. */
export const APP_NAME = "Kanjiwa";
export const USER_INITIAL = "K";

export const PLAN = {
  number: 1,
  summary:
    "A calm daily kanji habit: a short flashcard deck each day with readings and meanings, a quick meaning quiz, and a clear map of your progress from N5 to N1.",
  audience:
    "Self-taught Japanese learners preparing for the JLPT who study in short sessions on their commute or before bed.",
  screens: [
    { title: "Welcome", part: "onboarding", purpose: "Pick a target JLPT level and daily kanji count, then flip a first demo card." },
    {
      title: "Kanjiwa Pro",
      part: "paywall",
      purpose: "Shows N3–N1 decks, reading quiz, weak-kanji review and detailed stats.",
      offers: "Monthly $3.99 / month (7-day trial) · Yearly $24.99 / year (7-day trial) · Lifetime $49.99 once",
    },
    { title: "Today", part: "tab", purpose: "Flip today's flashcards, mark known or learning, then launch the quiz." },
    { title: "Quiz", part: "tab", purpose: "Multiple-choice meaning quiz on today's or studied kanji." },
    { title: "Progress", part: "tab", purpose: "Progress bars for N5 to N1 with known and learning counts." },
    { title: "Kanji", part: "screen", purpose: "One kanji: readings, meanings, example words, your accuracy." },
    { title: "Settings", part: "settings", purpose: "JLPT level, daily count, quiz length, theme, restore purchases." },
  ],
  themes: ["#c8402f", "#d4a64a", "#5e8c3a", "#3e6fb0", "#d9668a"],
};

export const READY =
  "Kanjiwa is ready: Welcome, Kanjiwa Pro, Today, Quiz, Progress, Kanji, Settings. Switch themes on the right, click any element to edit it, or tell me what to change.";

/** Canvas frames in journey order, as the product sorts them (captures v3-screen-0..6). */
export const SCREENS = [
  { part: "Onboarding", title: "Onboarding", src: "app/screen-0.png" },
  { part: "Paywall", title: "Paywall", src: "app/screen-1.png" },
  { part: "Main app", title: "Home", src: "app/screen-2.png" },
  { part: "Main app", title: "Progress", src: "app/screen-3.png" },
  { part: "Main app", title: "Quiz", src: "app/screen-4.png" },
  { part: "Main app", title: "Kanji / :id", src: "app/screen-5.png" },
  { part: "Settings", title: "Settings", src: "app/screen-6.png" },
];

/** Store listing fields as written on production (evidence/v3-info.json). */
export const LISTING = {
  name: "Kanjiwa: Daily JLPT Kanji",
  subtitle: "A small kanji deck, every day",
  promo:
    "Burned out on endless review piles? Kanjiwa gives you one small, finishable kanji deck at your JLPT level each day, so every session ends with a win.",
  short: "One small daily kanji deck for your JLPT level. Flip, quiz, and finish with a",
  keywords: "JLPT,kanji,Japanese,flashcards,N5,N4,N3,N2,N1,study,vocabulary,quiz,streak,learn,onyomi,kunyomi",
  category: "Education",
  description:
    "Kanjiwa is a calm daily kanji habit for self-taught Japanese learners preparing for the JLPT. It was built by a learner who kept burning out on 200-card review piles. So Kanjiwa caps each day to a small deck at your level.",
  /** The full description production wrote is 2,055 characters; the film shows its opening. */
  descriptionLength: 2055,
  shots: ["app/store-0.png", "app/store-1.png", "app/store-2.png", "app/store-3.png", "app/store-4.png"],
};

/**
 * The in-place edit: the paywall headline, retyped. Geometry measured on production in the
 * capture's own CSS px (390 wide incl. the 8 px bezel): evidence/v3-paywall-headline.json.
 */
export const EDIT = {
  index: 1,
  editedSrc: "app/paywall-edited.png",
  box: { x: 32, y: 87, w: 270 },
  lineWidths: [208.9, 249.6, 168.3],
  lineH: 31,
  fontSize: 26,
};
