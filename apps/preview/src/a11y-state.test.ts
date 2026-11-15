import { describe, expect, it } from "vitest";
import { withAriaState } from "./a11y-state";

describe("accessibilityState in the preview", () => {
  it("adds the aria-* props react-native-web reads, keeping accessibilityState", () => {
    const props = {
      accessibilityRole: "radio",
      accessibilityState: { checked: true, selected: false, expanded: undefined },
    };
    expect(withAriaState(props)).toEqual({
      ...props,
      "aria-checked": true,
      "aria-selected": false,
    });
    expect(withAriaState({ accessibilityState: { checked: "mixed" } })).toMatchObject({
      "aria-checked": "mixed",
    });
  });

  it("leaves aria-* given directly, and props without a state, as they are", () => {
    expect(
      withAriaState({ accessibilityState: { checked: true }, "aria-checked": false }),
    ).toMatchObject({ "aria-checked": false });
    const plain = { accessibilityRole: "button" };
    expect(withAriaState(plain)).toBe(plain);
    expect(withAriaState(null)).toBeNull();
  });
});
