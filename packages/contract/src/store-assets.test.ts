import { describe, expect, it } from "vitest";
import type { AppDataPractices } from "./app-privacy";
import type { AppPlan } from "./app-plan";
import {
  ageRatingAnswers,
  ascCategoryId,
  iconPrompt,
  privacyAnswers,
  readableOn,
  reviewNotes,
} from "./store-assets";

const practices: AppDataPractices = {
  cloud: false,
  accounts: false,
  analytics: false,
  ai: false,
  camera: false,
  photos: false,
  location: false,
  push: false,
  reminders: true,
  purchases: true,
  supportChat: false,
  appName: "Streaks",
  supportEmail: "help@example.com",
};

const plan = {
  appName: "Streaks",
  summary: "Keep a habit going.",
  angle: "Built by a runner",
  coreLoop: "Tick off today's habit",
  habit: { daily: "Tick off today's habit", carrot: "", stick: "" },
  themes: [{ id: "ocean", name: "Ocean", mood: "calm", dark: false, primary: "#1E6FD9" }],
} as unknown as AppPlan;

describe("App Store submission helpers", () => {
  it("maps a listing's category to App Store Connect's id", () => {
    expect(ascCategoryId("Health & Fitness")).toBe("HEALTH_AND_FITNESS");
    expect(ascCategoryId(" education ")).toBe("EDUCATION");
    expect(ascCategoryId("Photo & Video")).toBe("PHOTO_AND_VIDEO");
    expect(ascCategoryId("Wellness")).toBeNull();
  });

  it("answers the age rating with nothing that applies, except health topics for health apps", () => {
    const answers = ageRatingAnswers("PRODUCTIVITY");
    expect(answers.violenceRealistic).toBe("NONE");
    expect(answers.userGeneratedContent).toBe(false);
    expect(answers.healthOrWellnessTopics).toBe(false);
    expect(ageRatingAnswers("HEALTH_AND_FITNESS").healthOrWellnessTopics).toBe(true);
    // INFREQUENT_OR_MILD and FREQUENT_OR_INTENSE are deprecated; nothing uses them.
    expect(Object.values(answers)).not.toContain("INFREQUENT_OR_MILD");
  });

  it("lists the App Privacy answers from what the app really uses", () => {
    expect(privacyAnswers(practices).map((a) => a.dataType)).toEqual([
      "Crash Data",
      "Other Diagnostic Data",
      "Purchase History",
    ]);
    const cloud = privacyAnswers({ ...practices, cloud: true, accounts: true, analytics: true });
    expect(cloud.find((a) => a.dataType === "Email Address")?.linkedToUser).toBe(true);
    expect(cloud.find((a) => a.dataType === "Product Interaction")).toEqual({
      dataType: "Product Interaction",
      purpose: "Analytics",
      linkedToUser: false,
    });
    // AI questions are only processed to answer, which Apple doesn't count as collected.
    expect(privacyAnswers({ ...practices, ai: true })).toEqual(privacyAnswers(practices));
  });

  it("writes App Review notes with the demo account and how to try the app", () => {
    const notes = reviewNotes({
      plan,
      practices: { ...practices, cloud: true, accounts: true },
      appName: "Streaks",
      demoAccount: { email: "app-review+p_1@example.com", password: "s3cret-pass" },
      supportUrl: "https://build.example/apps/p_1/support",
    });
    expect(notes).toContain("How to try it: Tick off today's habit.");
    expect(notes).toContain("app-review+p_1@example.com / s3cret-pass");
    expect(notes).toContain("Settings → Delete account");
    expect(notes).toContain("Restore Purchases");
    expect(
      reviewNotes({ plan, practices, appName: "Streaks", demoAccount: null, supportUrl: "" }),
    ).toContain("No account is needed.");
  });

  it("asks for an icon without text or transparency, and picks readable caption colors", () => {
    const prompt = iconPrompt(plan, "#1E6FD9");
    expect(prompt).toContain('"Streaks"');
    expect(prompt).toContain("#1E6FD9");
    expect(prompt).toMatch(/No text/);
    expect(readableOn("#1E6FD9")).toBe("#ffffff");
    expect(readableOn("#D9F99D")).toBe("#111111");
  });
});
