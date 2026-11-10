/**
 * The app quality rubric: what a good generated app does in each of its four parts, plus craft.
 * One definition feeds the generator's prompts (in spirit), the deterministic checks
 * (quality.ts), the model judge and docs/08-app-quality-rubric.md, so they can't drift.
 *
 * Sources: Expo's agent skills (design rubric, native-slop tells, onboarding gating), the ECC
 * harness (generator/evaluator separation, evidence, hard caps), the mobile auth and membership
 * skills (entitlements, restore, account deletion), Apple's subscription and account-deletion
 * guidelines, and two talks on building apps people pay for (a personal angle and one core loop;
 * shareable moments and conversion).
 */
export type RubricPart = "onboarding" | "paywall" | "main" | "settings" | "craft";

export interface RubricCriterion {
  id: string;
  part: RubricPart;
  title: string;
  /** Points out of 100 at a full score (3 of 3). */
  weight: number;
  /** What a 3 looks like. */
  good: string;
  /** What a 0 looks like. */
  bad: string;
}

export const RUBRIC_PARTS: Record<RubricPart, string> = {
  onboarding: "Onboarding",
  paywall: "Paywall",
  main: "Main app",
  settings: "Settings",
  craft: "Craft",
};

export const RUBRIC: readonly RubricCriterion[] = [
  // Onboarding (15)
  {
    id: "O1",
    part: "onboarding",
    title: "Fast to first value",
    weight: 5,
    good: "2–4 steps with progress, skippable, ending in the app with the core action one tap away.",
    bad: "No onboarding, or a long flow that can't be skipped and ends somewhere unrelated.",
  },
  {
    id: "O2",
    part: "onboarding",
    title: "Steps that do work",
    weight: 5,
    good: "Questions that personalize the app (answers saved and visibly used by the main screens), a try-it-once demo, or a permission explained before it's asked.",
    bad: "Generic promotional slides (the onboarding carousel) that collect nothing and teach nothing.",
  },
  {
    id: "O3",
    part: "onboarding",
    title: "Specific voice",
    weight: 5,
    good: "Short, warm copy written for this audience and angle; it could not belong to another app.",
    bad: '"Welcome to <App>", placeholder or generic AI copy, fake screenshots.',
  },
  // Paywall (20)
  {
    id: "P1",
    part: "paywall",
    title: "Clear value",
    weight: 4,
    good: "A headline about the outcome and 2–4 concrete premium features that exist in the app.",
    bad: 'Vague "unlock premium content" with no idea what is gained.',
  },
  {
    id: "P2",
    part: "paywall",
    title: "Clear prices",
    weight: 4,
    good: "Each offer shows its price per period, trial length and badge; the selected offer and what is billed when are obvious.",
    bad: "Prices hidden, ambiguous (no period) or trial terms missing.",
  },
  {
    id: "P3",
    part: "paywall",
    title: "Required controls",
    weight: 4,
    good: "A visible close button, Restore Purchases, the auto-renewal terms, and Terms and Privacy links.",
    bad: "No way to close, no restore, or no renewal disclosure (App Store rejection risk).",
  },
  {
    id: "P4",
    part: "paywall",
    title: "Honest and well timed",
    weight: 4,
    good: "Shown after onboarding and at locked features; no fake urgency or hidden close; simulated purchases say so.",
    bad: "Fake countdowns or scarcity, delayed or disguised close, or a hard wall before any value.",
  },
  {
    id: "P5",
    part: "paywall",
    title: "Entitlements wired",
    weight: 4,
    good: "Premium features in the main app check isPremium and open the paywall when locked; purchase shows progress, errors and the already-premium state.",
    bad: "Nothing is actually gated, or a success animation is the only purchase handling.",
  },
  // Main app (35)
  {
    id: "M1",
    part: "main",
    title: "Core loop first",
    weight: 7,
    good: "The one repeatable action is obvious and one tap from home; the app does that thing really well.",
    bad: "A grab bag of screens with no clear reason to come back.",
  },
  {
    id: "M2",
    part: "main",
    title: "Real content and states",
    weight: 7,
    good: "Realistic seed data; loading, empty (with a next action) and content states; no placeholder text.",
    bad: "Lorem ipsum, TODOs, empty screens with no guidance, or the empty state flashing while loading.",
  },
  {
    id: "M3",
    part: "main",
    title: "Every control works",
    weight: 7,
    good: "Each button does what its label promises; forms validate; data changes persist.",
    bad: "Dead buttons, empty handlers, or Alert pop-ups standing in for features.",
  },
  {
    id: "M4",
    part: "main",
    title: "Distinctive and shareable",
    weight: 7,
    good: "A visible point of view for its audience and one result worth screenshotting and sharing.",
    bad: "A generic template app indistinguishable from thousands of others.",
  },
  {
    id: "M5",
    part: "main",
    title: "Navigation conventions",
    weight: 7,
    good: "2–5 tabs, titles in the navigator header for stack screens, settings reachable from home, back always works, modals as routes.",
    bad: "Hand-rolled headers and modals, dead ends, settings unreachable.",
  },
  // Settings (10)
  {
    id: "S1",
    part: "settings",
    title: "Subscription",
    weight: 4,
    good: "Plan status, Upgrade, Restore Purchases and Manage subscription (store link).",
    bad: "No subscription controls at all.",
  },
  {
    id: "S2",
    part: "settings",
    title: "Support, legal and about",
    weight: 3,
    good: "Contact support, Privacy Policy, Terms of Use and the app version (and sign out and account deletion when the app has accounts).",
    bad: "No way to get help or read the policies.",
  },
  {
    id: "S3",
    part: "settings",
    title: "Preferences that matter",
    weight: 3,
    good: "Grouped sections of settings that change the app (including onboarding answers and replaying onboarding).",
    bad: "Decorative toggles that do nothing.",
  },
  // Craft (20)
  {
    id: "C1",
    part: "craft",
    title: "Layout and hierarchy",
    weight: 5,
    good: "One focal point and primary action per screen; grouping through spacing and size rather than boxes.",
    bad: "Everything is a card of equal weight; no clear first read.",
  },
  {
    id: "C2",
    part: "craft",
    title: "Spacing and type",
    weight: 5,
    good: "A consistent spacing scale (tight within groups, wider between), a clear type ramp, tabular numbers.",
    bad: "Cramped or uniform 16-everything spacing; random font sizes.",
  },
  {
    id: "C3",
    part: "craft",
    title: "Color and contrast",
    weight: 4,
    good: "Legible text on every surface in light and dark themes; color is not the only signal.",
    bad: "Low-contrast text, a dark theme that breaks, gradient-heavy hero banners.",
  },
  {
    id: "C4",
    part: "craft",
    title: "Accessibility",
    weight: 3,
    good: "Icon-only controls have labels and roles; 44pt targets; font scaling allowed.",
    bad: "Unlabeled icon buttons, tiny targets, disabled font scaling.",
  },
  {
    id: "C5",
    part: "craft",
    title: "No slop tells",
    weight: 3,
    good: "None of: emoji as icons, purple gradient heroes, TouchableOpacity, custom modals, Alert confirmations, hand-rolled headers.",
    bad: "Several of them.",
  },
];

/** Hard caps: a critical failure limits the score no matter how good the rest is. */
export const RUBRIC_CAPS = {
  /** A screen fails to render in the preview. */
  renderFailure: 40,
} as const;

export function rubricMarkdown(): string {
  const parts = Object.keys(RUBRIC_PARTS) as RubricPart[];
  return parts
    .map((part) => {
      const rows = RUBRIC.filter((c) => c.part === part);
      const total = rows.reduce((sum, c) => sum + c.weight, 0);
      return [
        `### ${RUBRIC_PARTS[part]} (${total} points)`,
        "",
        "| | Criterion | Points | 3: good | 0: bad |",
        "|---|---|---:|---|---|",
        ...rows.map((c) => `| ${c.id} | ${c.title} | ${c.weight} | ${c.good} | ${c.bad} |`),
      ].join("\n");
    })
    .join("\n\n");
}

export interface JudgedCriterion {
  /** 0–3 from the judge (averaged when there are several judges). */
  score: number;
  evidence: string;
  fix: string;
}

export interface CriterionResult extends JudgedCriterion {
  id: string;
  part: RubricPart;
  title: string;
  weight: number;
  /** The judge's score before deterministic caps. */
  judged: number;
  /** 3 unless a deterministic check failed. */
  cap: number;
  points: number;
}

export interface RubricScore {
  criteria: CriterionResult[];
  parts: Record<RubricPart, { points: number; max: number }>;
  total: number;
  /** Set when a hard cap limited the total. */
  cappedBy: string | null;
}

/** Combine judge scores with the deterministic caps into points out of 100. */
export function scoreRubric(
  judged: Record<string, JudgedCriterion>,
  caps: Record<string, number>,
  options: { renderFailure?: boolean } = {},
): RubricScore {
  const round = (n: number) => Math.round(n * 10) / 10;
  const criteria = RUBRIC.map((c) => {
    const j = judged[c.id] ?? { score: 0, evidence: "Not judged.", fix: "" };
    const cap = caps[c.id] ?? 3;
    const score = Math.max(0, Math.min(3, j.score, cap));
    return {
      ...j,
      id: c.id,
      part: c.part,
      title: c.title,
      weight: c.weight,
      judged: j.score,
      cap,
      score,
      points: round((c.weight * score) / 3),
    };
  });
  const parts = Object.fromEntries(
    (Object.keys(RUBRIC_PARTS) as RubricPart[]).map((part) => {
      const rows = criteria.filter((c) => c.part === part);
      return [
        part,
        {
          points: round(rows.reduce((sum, c) => sum + c.points, 0)),
          max: rows.reduce((sum, c) => sum + c.weight, 0),
        },
      ];
    }),
  ) as RubricScore["parts"];
  let total = round(criteria.reduce((sum, c) => sum + c.points, 0));
  let cappedBy: string | null = null;
  if (options.renderFailure && total > RUBRIC_CAPS.renderFailure) {
    total = RUBRIC_CAPS.renderFailure;
    cappedBy = `A screen failed to render (total capped at ${RUBRIC_CAPS.renderFailure})`;
  }
  return { criteria, parts, total, cappedBy };
}
