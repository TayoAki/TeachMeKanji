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
  it("keeps every paid plan at the target gross margin, even if all credits are used", async () => {
    const { PAID_PLANS, planMargin, TARGET_MARGIN, PLANS } = await import("./billing");
    for (const plan of PAID_PLANS) expect(planMargin(plan)).toBeGreaterThanOrEqual(TARGET_MARGIN);
    expect(PLANS.studio.mcp && PLANS.pro.mcp && !PLANS.builder.mcp && !PLANS.free.mcp).toBe(true);
    // The entry plan is priced like other AI app builders and includes a few builds a month.
    expect(PLANS.builder.priceUsdPerMonth).toBeLessThanOrEqual(25);
    expect(PLANS.builder.monthlyCredits).toBeGreaterThanOrEqual(200);
  });

  it("grants complimentary plans by email, ignoring unknown plans", async () => {
    const { compPlanFor } = await import("./billing");
    process.env.COMP_PLANS =
      "Owner@Example.com:studio, tester@example.com:pro, x@example.com:toString";
    try {
      expect(compPlanFor("owner@example.com")).toBe("studio");
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
