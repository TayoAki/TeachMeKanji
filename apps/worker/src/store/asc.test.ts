import { describe, expect, it } from "vitest";
import { preOrderDateProblem } from "./asc";

describe("pre-order release dates", () => {
  it("must be 2 to 180 days ahead (Apple's limits for a first release)", () => {
    const today = new Date("2026-11-15T12:00:00Z");
    expect(preOrderDateProblem("2026-11-16", today)).toMatch(/2 to 180 days/);
    expect(preOrderDateProblem("2026-11-17", today)).toBeNull();
    expect(preOrderDateProblem("2027-05-14", today)).toBeNull();
    expect(preOrderDateProblem("2027-05-15", today)).toMatch(/2 to 180 days/);
    expect(preOrderDateProblem("next week", today)).toBe("Pick the release date.");
  });
});
