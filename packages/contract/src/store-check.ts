/**
 * The App Store readiness check (the funnel's lead magnet, /check): yes/no questions about a
 * subscription app, each tied to what App Review asks for. Pure data, shared by the page, the
 * results email and the server's scoring.
 */
export interface StoreCheckItem {
  id: string;
  /** The yes/no question, worded so "yes" passes. */
  question: string;
  /** Why it matters, with the App Review Guideline it comes from where there is one. */
  why: string;
  /** What to do when the answer is no. */
  fix: string;
}

export const STORE_CHECKS: StoreCheckItem[] = [
  {
    id: "price-period",
    question:
      "Does every plan on your paywall show its price and billing period (e.g. $24.99 / year)?",
    why: "App Review Guideline 3.1.2 asks you to describe clearly what people get and what they pay before they subscribe.",
    fix: "Show the full price and the period next to each plan, not only a per-week or per-month breakdown.",
  },
  {
    id: "trial-terms",
    question:
      "If you offer a free trial, does the paywall say how long it lasts and what it costs after?",
    why: "Under Guideline 3.1.2, trial terms have to be clear before purchase; unclear trials are a common reason for complaints and refunds.",
    fix: 'Add one line under the button, e.g. "7 days free, then $24.99 / year." (Answer yes if you have no trial.)',
  },
  {
    id: "auto-renew",
    question: "Does the paywall say the subscription renews automatically until cancelled?",
    why: "Guideline 3.1.2 covers auto-renewable subscriptions; people need to know it renews and how to cancel.",
    fix: 'Add: "Renews automatically unless cancelled at least 24 hours before the end of the period. Cancel anytime in your App Store settings."',
  },
  {
    id: "legal-links",
    question: "Does the paywall link to your Terms of Use and Privacy Policy?",
    why: "Apps with auto-renewable subscriptions are expected to link both in the app and in the App Store listing.",
    fix: "Add two small links under the purchase button, and the same URLs in App Store Connect.",
  },
  {
    id: "restore",
    question: "Can people restore an earlier purchase (a Restore Purchases button)?",
    why: "Guideline 3.1.1 asks for a way to restore purchases, so people who reinstall or switch phones get back what they paid for.",
    fix: "Put Restore Purchases on the paywall and again in Settings.",
  },
  {
    id: "close",
    question: "Can people close the paywall and keep using the free part of your app?",
    why: "A paywall with no way out reads as a trap to reviewers and users alike, and hurts trust and ratings.",
    fix: 'Add a clear close button (top corner) or a "Not now" link.',
  },
  {
    id: "privacy-url",
    question: "Do you have a privacy policy URL ready for App Store Connect?",
    why: "Guideline 5.1.1 requires a privacy policy link in App Store Connect and inside the app.",
    fix: "Publish a privacy policy page that matches what your app really collects, and link it in Settings.",
  },
  {
    id: "account-deletion",
    question: "If people can create an account, can they delete it inside the app?",
    why: "Guideline 5.1.1(v) requires apps that support account creation to let people delete their account in the app. (Answer yes if there are no accounts.)",
    fix: 'Add "Delete account" in Settings, and make it actually remove the account and its data.',
  },
  {
    id: "login",
    question:
      "If you offer Google or Facebook sign-in, do you also offer Sign in with Apple (or an equivalent private option)?",
    why: "Guideline 4.8 asks apps that use third-party login to offer an equivalent option that limits data collection. (Answer yes if you use email only.)",
    fix: "Add Sign in with Apple next to the other sign-in buttons.",
  },
  {
    id: "screenshots",
    question:
      "Do your store screenshots show the real app, in the sizes App Store Connect asks for?",
    why: "Guideline 2.3 asks for screenshots that show the app in use, accurately.",
    fix: "Capture real screens at the required sizes, and add short captions about what each one does.",
  },
];

export type StoreCheckAnswer = "yes" | "no" | "unsure";

/** Score a set of answers: "unsure" counts as not passed, so the fix is shown. */
export function scoreStoreCheck(answers: Record<string, StoreCheckAnswer>): {
  passed: number;
  total: number;
  failed: StoreCheckItem[];
} {
  const failed = STORE_CHECKS.filter((c) => answers[c.id] !== "yes");
  return { passed: STORE_CHECKS.length - failed.length, total: STORE_CHECKS.length, failed };
}

/** The four post-check survey questions (the answers decide the homepage lead and the offer). */
export const FUNNEL_SURVEY = {
  stage: {
    question: "Where are you with your app?",
    options: [
      "Just an idea",
      "Building it now",
      "It's on TestFlight",
      "It's in the App Store",
      "I've shipped apps before",
    ],
  },
  challenge: {
    question: "What's been hardest so far?",
    options: [
      "The AI breaking things and re-fixing on paid credits",
      "Getting it into the App Store",
      "Taking payments / subscriptions",
      "Making it look good",
      "Knowing if anyone wants it",
      "Other",
    ],
  },
  tools: {
    question: "What have you used? (pick any)",
    options: [
      "Vibecode",
      "Rork",
      "Replit",
      "a0",
      "Bolt",
      "Cursor / Claude Code",
      "A developer",
      "Nothing yet",
    ],
  },
  win: { question: "What would make this a win for you in the next 30 days?" },
} as const;
