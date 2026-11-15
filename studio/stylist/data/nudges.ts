import type { NudgePlan } from "./habit";

// The daily outfit, written for the morning, and a streak note in the evening only on a day
// the person hasn't picked an outfit yet.
export const nudges: NudgePlan = {
  carrot: {
    hour: 7,
    minute: 15,
    title: "Today's outfit is ready",
    body: "Picked from your closet for today's weather. Open it before you get dressed.",
  },
  stick: {
    hour: 19,
    minute: 30,
    title: "Plan tomorrow tonight",
    body: "You've dressed with a plan {streak} days running. Pick tomorrow's look in a minute.",
  },
  href: "/",
};
