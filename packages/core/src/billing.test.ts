import { describe, expect, it } from "vitest";
import { BUILD_FROM_MOCKUPS_FLOOR, buildFromMockupsReserve, RUN_CREDITS } from "./billing";

describe("a build from mockups' reserve", () => {
  it("takes its full reserve when the account has it, else what's left, never under the floor", () => {
    expect(buildFromMockupsReserve(500)).toBe(RUN_CREDITS.build_from_mockups!.reserve);
    expect(buildFromMockupsReserve(52)).toBe(52);
    expect(buildFromMockupsReserve(12)).toBe(BUILD_FROM_MOCKUPS_FLOOR);
  });
});
