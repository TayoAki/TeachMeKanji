import { describe, expect, it } from "vitest";
import { supportChatDecision } from "./support-chat";

describe("the included support chat on a build", () => {
  const paid = { included: true, enabled: true };
  it("switches it on for a paying owner's app, once", () => {
    expect(supportChatDecision({ current: "", managedAppId: null, ...paid })).toBe("provision");
    expect(supportChatDecision({ current: "app_A1", managedAppId: "app_A1", ...paid })).toBe(
      "keep",
    );
  });

  it("goes back to email when the owner switches it off or stops paying", () => {
    const on = { current: "app_A1", managedAppId: "app_A1" };
    expect(supportChatDecision({ ...on, included: true, enabled: false })).toBe("email");
    expect(supportChatDecision({ ...on, included: false, enabled: true })).toBe("email");
    expect(
      supportChatDecision({ current: "", managedAppId: "app_A1", included: false, enabled: true }),
    ).toBe("keep");
  });

  it("never touches an App ID from the owner's own Hire Shelby account", () => {
    expect(supportChatDecision({ current: "app_Own1", managedAppId: null, ...paid })).toBe("keep");
    expect(
      supportChatDecision({
        current: "app_Own1",
        managedAppId: "app_A1",
        included: false,
        enabled: false,
      }),
    ).toBe("keep");
  });
});
