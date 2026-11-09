/**
 * Plans, limits and credit pricing. One credit is worth CREDIT_USD of model cost; a run is
 * charged its measured cost in credits, never less than its minimum. Tune these numbers with
 * real usage data before launch.
 */
export const CREDIT_USD = 0.05;

export type PlanId = "free" | "pro";

export interface PlanLimits {
  name: string;
  priceUsdPerMonth: number;
  signupCredits: number;
  monthlyCredits: number;
  maxProjects: number | null;
  maxScreensPerProject: number;
  nativeBuilds: boolean;
}

export const PLANS: Record<PlanId, PlanLimits> = {
  free: {
    name: "Free",
    priceUsdPerMonth: 0,
    signupCredits: 100,
    monthlyCredits: 0,
    maxProjects: 2,
    maxScreensPerProject: 5,
    nativeBuilds: false,
  },
  pro: {
    name: "Pro",
    priceUsdPerMonth: 30,
    signupCredits: 0,
    monthlyCredits: 500,
    maxProjects: null,
    maxScreensPerProject: 12,
    nativeBuilds: true,
  },
};

/**
 * Credits reserved when a run starts (released when it settles) and the minimum charge for a
 * successful run. The reserve is also the run's budget: the worker stops a run whose measured
 * cost reaches it, and a run is never charged more than it reserved.
 */
export const RUN_CREDITS: Record<string, { reserve: number; minimum: number }> = {
  plan: { reserve: 6, minimum: 1 },
  build: { reserve: 60, minimum: 8 },
  edit: { reserve: 12, minimum: 2 },
  device_preview: { reserve: 0, minimum: 0 },
  github_push: { reserve: 0, minimum: 0 },
  native_build: { reserve: 0, minimum: 0 },
};

/** Credits for a measured cost, before minimums and caps. */
export function creditsForCost(costUsd: number | null): number {
  return costUsd === null ? 0 : Math.ceil(costUsd / CREDIT_USD);
}

/**
 * What a finished run pays: its measured cost in credits, at least the kind's minimum when it
 * succeeded (failures pay only what they used), and never more than it reserved.
 */
export function chargeForRun(
  kind: string,
  reserved: number,
  costUsd: number | null,
  outcome: "succeeded" | "failed",
): number {
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
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
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
