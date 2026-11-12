/**
 * Plans, limits and credit pricing. One credit is worth CREDIT_USD of model cost; a run is
 * charged its measured cost in credits, never less than its minimum.
 *
 * Each paid plan's monthly credits are derived from its price and its target gross margin
 * (PLAN_TARGET_MARGIN), assuming a subscriber spends every included credit (see planMargin);
 * most don't, so the real margin is higher. Prices include tax where it applies (Stripe Tax,
 * inclusive): with no tax registrations today the whole price is revenue. Check
 * HOSTING_USD_PER_USER_MONTH against real bills after launch.
 */
export const CREDIT_USD = 0.05;
/** Estimated hosting cost of one active paying user per month (database, compute, bandwidth). */
export const HOSTING_USD_PER_USER_MONTH = 2;
/** Card processing (2.9% + $0.30, US cards) plus Stripe Billing (0.7%) on each monthly charge. */
export const PAYMENT_FEE_RATE = 0.029 + 0.007;
export const PAYMENT_FEE_FIXED_USD = 0.3;

export type PlanId = "free" | "builder" | "pro";
export type PaidPlanId = Exclude<PlanId, "free">;
export const PAID_PLANS: readonly PaidPlanId[] = ["builder", "pro"];

/** The gross margin each paid plan keeps when all of its credits are spent. */
export const PLAN_TARGET_MARGIN: Record<PaidPlanId, number> = { builder: 0.6, pro: 0.8 };

/** The most credits a plan at `price` can include and still keep `margin` with all of them spent. */
export function creditsForMargin(price: number, margin: number): number {
  const fees = price * PAYMENT_FEE_RATE + PAYMENT_FEE_FIXED_USD;
  const aiBudget = price * (1 - margin) - HOSTING_USD_PER_USER_MONTH - fees;
  return Math.max(0, Math.floor(aiBudget / CREDIT_USD + 1e-9));
}

export interface PlanLimits {
  name: string;
  priceUsdPerMonth: number;
  signupCredits: number;
  monthlyCredits: number;
  maxProjects: number | null;
  maxScreensPerProject: number;
  nativeBuilds: boolean;
  /** Use the builder from your own AI assistant (Claude, ChatGPT, Cursor…) through MCP. */
  mcp: boolean;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    name: "Free",
    priceUsdPerMonth: 0,
    // One designed and built app (about 26 credits on the default models) plus edits and redraws.
    signupCredits: 60,
    monthlyCredits: 0,
    maxProjects: 2,
    maxScreensPerProject: 5,
    nativeBuilds: false,
    mcp: false,
  },
  builder: {
    name: "Builder",
    priceUsdPerMonth: 49,
    signupCredits: 0,
    monthlyCredits: creditsForMargin(49, PLAN_TARGET_MARGIN.builder), // 310
    maxProjects: null,
    maxScreensPerProject: 12,
    nativeBuilds: true,
    mcp: false,
  },
  pro: {
    name: "Pro",
    priceUsdPerMonth: 200,
    signupCredits: 0,
    monthlyCredits: creditsForMargin(200, PLAN_TARGET_MARGIN.pro), // 610
    maxProjects: null,
    maxScreensPerProject: 20,
    nativeBuilds: true,
    mcp: true,
  },
};

export function isPlanId(value: unknown): value is PlanId {
  return typeof value === "string" && Object.hasOwn(PLANS, value);
}

/**
 * Worst-case monthly cost of serving one subscriber (COGS): every included credit spent on model
 * usage, hosting, and payment fees. Credits aren't sold separately, so they can't exceed what
 * plans include.
 */
export function planCost(plan: PaidPlanId): { ai: number; hosting: number; payments: number } {
  const { priceUsdPerMonth, monthlyCredits } = PLANS[plan];
  return {
    ai: monthlyCredits * CREDIT_USD,
    hosting: HOSTING_USD_PER_USER_MONTH,
    payments: priceUsdPerMonth * PAYMENT_FEE_RATE + PAYMENT_FEE_FIXED_USD,
  };
}

export function planMargin(plan: PaidPlanId): number {
  const { ai, hosting, payments } = planCost(plan);
  const price = PLANS[plan].priceUsdPerMonth;
  return (price - ai - hosting - payments) / price;
}

/**
 * Complimentary plans by email, for the team and testers: COMP_PLANS="you@x.com:pro,b@y.com:builder".
 * A real subscription always wins.
 */
export function compPlanFor(email: string): PlanId | null {
  for (const entry of (process.env.COMP_PLANS || "").split(",")) {
    const [who, plan] = entry.trim().split(":");
    if (
      who &&
      who.toLowerCase() === email.toLowerCase() &&
      isPlanId(plan) &&
      Object.hasOwn(PLANS, plan)
    ) {
      return plan;
    }
  }
  return null;
}

/**
 * Credits reserved when a run starts (released when it settles) and the minimum charge for a
 * successful run. The reserve is also the run's budget: the worker stops a run whose measured
 * cost reaches it, and a run is never charged more than it reserved.
 */
export const RUN_CREDITS: Record<string, { reserve: number; minimum: number }> = {
  // Research on the web (Haiku with search) and the plan (Sonnet): about 5 credits.
  plan: { reserve: 12, minimum: 1 },
  // A build without mockups, on the default model (Haiku): a few credits.
  build: { reserve: 30, minimum: 8 },
  // A build from approved mockups on Haiku: measured $0.13 (3 credits), then the mockup check,
  // which is free but runs inside this reserve. Low enough that a free account can design and
  // then build one app.
  build_from_mockups: { reserve: 30, minimum: 8 },
  // A chat edit on Haiku, with the regression lock's checks inside it: a credit or two.
  edit: { reserve: 12, minimum: 2 },
  // Two judges scoring screenshots and code against the quality rubric.
  review: { reserve: 20, minimum: 1 },
  device_preview: { reserve: 0, minimum: 0 },
  github_push: { reserve: 0, minimum: 0 },
  native_build: { reserve: 0, minimum: 0 },
  payments_setup: { reserve: 40, minimum: 1 },
  store_listing: { reserve: 8, minimum: 1 },
  promo_storyboard: { reserve: 6, minimum: 1 },
  // No model: a few minutes of the worker's CPU, well under a credit.
  promo_render: { reserve: 1, minimum: 1 },
  // Design direction, mascot poses and a mockup of every screen, checked: mostly the images
  // (Nano Banana 2.1), measured 17 credits for seven screens.
  design: { reserve: 40, minimum: 10 },
  // Redraw one mockup or the mascot from a note: one or two images and a check.
  mockup: { reserve: 10, minimum: 1 },
};

/** Credits for a measured cost, before minimums and caps. */
/** A build from mockups costs a few credits on Haiku; this much it always reserves. */
export const BUILD_FROM_MOCKUPS_FLOOR = 20;

/**
 * What a build from mockups reserves: its full reserve (room for the match check) when the
 * account has it, otherwise what the account has, down to the floor a build needs. So a free
 * account that designed an app can always build it; only the match check gets less room.
 */
export function buildFromMockupsReserve(balance: number): number {
  const full = RUN_CREDITS.build_from_mockups!.reserve;
  return Math.max(BUILD_FROM_MOCKUPS_FLOOR, Math.min(full, balance));
}

export function creditsForCost(costUsd: number | null): number {
  return costUsd === null ? 0 : Math.ceil(costUsd / CREDIT_USD);
}

/**
 * What a finished run pays: its measured cost in credits (the free calls, repairs and the mockup
 * check, already left out), at least the kind's minimum when it succeeded, and never more than
 * it reserved. A failed run is the platform's mistake and costs nothing; a run the user
 * cancelled pays for the usage it consumed, with no minimum.
 */
export function chargeForRun(
  kind: string,
  reserved: number,
  costUsd: number | null,
  outcome: "succeeded" | "failed" | "cancelled",
): number {
  if (outcome === "failed") return 0;
  const minimum = outcome === "succeeded" ? (RUN_CREDITS[kind]?.minimum ?? 0) : 0;
  const cap = Math.max(reserved, minimum);
  return Math.min(cap, Math.max(minimum, creditsForCost(costUsd)));
}

/** The model-cost budget (USD) for a run: its reserve. */
export function runBudgetUsd(reserved: number): number {
  return reserved * CREDIT_USD;
}

/** List prices per million tokens (USD), as of 2026-10. Verify before billing on them. */
export const MODEL_PRICES: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  // Through OpenRouter (whose own reported cost is used when it gives one).
  "google/gemini-3.8-flash": { input: 0.75, output: 3.75, cacheRead: 0.075, cacheWrite: 0.042 },
  "deepseek/deepseek-v4-flash": { input: 0.09, output: 0.18, cacheRead: 0.018, cacheWrite: 0 },
};

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export function costUsd(model: string, usage: TokenUsage): number | null {
  const price = MODEL_PRICES[model];
  if (!price) return null;
  return (
    (usage.input * price.input +
      usage.output * price.output +
      usage.cacheRead * price.cacheRead +
      usage.cacheWrite * price.cacheWrite) /
    1_000_000
  );
}
