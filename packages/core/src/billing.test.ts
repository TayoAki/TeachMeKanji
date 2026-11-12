import { describe, expect, it } from "vitest";
import { BUILD_FROM_MOCKUPS_FLOOR, buildFromMockupsReserve, RUN_CREDITS } from "./billing";

describe("a build from mockups' reserve", () => {
  it("takes its full reserve when the account has it, else what's left, never under the floor", () => {
    expect(buildFromMockupsReserve(500)).toBe(RUN_CREDITS.build_from_mockups!.reserve);
    expect(buildFromMockupsReserve(25)).toBe(25);
    expect(buildFromMockupsReserve(12)).toBe(BUILD_FROM_MOCKUPS_FLOOR);
    // A free account can design and then build its first app.
    expect(RUN_CREDITS.design!.reserve + BUILD_FROM_MOCKUPS_FLOOR).toBeLessThanOrEqual(60);
  });
});
