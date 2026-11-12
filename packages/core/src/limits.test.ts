import { describe, expect, it } from "vitest";
import { WindowLimiter } from "./limits";

describe("WindowLimiter", () => {
  it("allows up to the limit per key within the window, then recovers", () => {
    const limiter = new WindowLimiter(3, 1_000);
    expect([0, 10, 20].map((t) => limiter.take("a", t))).toEqual([true, true, true]);
    expect(limiter.take("a", 30)).toBe(false);
    // Other keys are independent.
    expect(limiter.take("b", 30)).toBe(true);
    // Refused attempts don't extend the lockout; old hits age out of the window.
    expect(limiter.take("a", 1_001)).toBe(true);
    expect(limiter.take("a", 1_002)).toBe(false);
    expect(limiter.take("a", 2_100)).toBe(true);
  });

  it("keeps memory bounded under a flood of distinct keys", () => {
    const limiter = new WindowLimiter(5, 60_000, 100);
    for (let i = 0; i < 1_000; i++) limiter.take(`flood-${i}`, 1_000 + i);
    expect(limiter.size).toBeLessThanOrEqual(100);
    // The most recently used keys are kept.
    expect(limiter.take("flood-999", 3_000)).toBe(true);
  });
});

describe("error report redaction", () => {
  it("drops query parameters but keeps the query and the stack", async () => {
    const { redact } = await import("./report");
    const text =
      'Failed query: insert into "app_user" values ($1, $2)\nparams: au_1,sam@example.com\n    at run (db.ts:1:1)';
    expect(redact(text)).toBe(
      'Failed query: insert into "app_user" values ($1, $2)\nparams: [redacted]\n    at run (db.ts:1:1)',
    );
    expect(redact("plain message")).toBe("plain message");
  });
});

describe("plan pricing", () => {
  it("keeps each paid plan at its target gross margin, even if all credits are used", async () => {
    const { PAID_PLANS, planMargin, PLAN_TARGET_MARGIN, PLANS, creditsForMargin } =
      await import("./billing");
    for (const plan of PAID_PLANS)
      expect(planMargin(plan)).toBeGreaterThanOrEqual(PLAN_TARGET_MARGIN[plan]);
    // $20 at 60%: 99 credits (about three new apps on Haiku); $200 at 80%: 610 credits.
    expect([PLANS.builder.priceUsdPerMonth, PLANS.builder.monthlyCredits]).toEqual([20, 99]);
    expect([PLANS.pro.priceUsdPerMonth, PLANS.pro.monthlyCredits]).toEqual([200, 610]);
    // One credit more would break the margin.
    expect(creditsForMargin(20, 0.6) + 1).toBeGreaterThan(99);
    expect(PLANS.pro.mcp && !PLANS.builder.mcp && !PLANS.free.mcp).toBe(true);
    expect(PLANS.free.signupCredits).toBe(60);
  });

  it("grants complimentary plans by email, ignoring unknown plans", async () => {
    const { compPlanFor } = await import("./billing");
    process.env.COMP_PLANS =
      "Owner@Example.com:builder, tester@example.com:pro, old@example.com:studio, x@example.com:toString";
    try {
      expect(compPlanFor("owner@example.com")).toBe("builder");
      expect(compPlanFor("old@example.com")).toBeNull(); // Studio no longer exists
      expect(compPlanFor("tester@example.com")).toBe("pro");
      expect(compPlanFor("x@example.com")).toBeNull();
      expect(compPlanFor("nobody@example.com")).toBeNull();
    } finally {
      delete process.env.COMP_PLANS;
    }
  });
});

describe("images", () => {
  it("recognizes image types from their bytes, not their names", async () => {
    const { sniffImage } = await import("./images");
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
    expect(sniffImage(png)).toBe("image/png");
    expect(sniffImage(Buffer.from("<svg onload=alert(1)>"))).toBeNull();
  });
});
