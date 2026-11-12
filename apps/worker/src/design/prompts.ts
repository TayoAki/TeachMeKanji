/**
 * Prompts for the design-first steps: researching the idea, setting the visual direction, and
 * the instructions the image model and the reviewers get. The offline provider recognises each
 * system prompt by its first words, so keep those stable.
 */
import type { AppPlan, DesignDirection, ResearchBrief } from "@appbuilder/contract";

// --- Research ------------------------------------------------------------------------------

export const RESEARCH_SYSTEM = `You research mobile app ideas for a builder that makes iPhone apps. Search the web for the top competing apps (App Store listings, reviews, Reddit threads, review articles) and what their users praise and complain about. Be concrete and name the apps. Don't invent apps or quotes: if you can't verify something the user claims, say so in the brief.

Reply with JSON only, no other text:
{"competitors":[{"name":"","whatPeopleLove":[""],"complaints":[""]}],"mustHaveFeatures":[""],"differentiators":[""],"signatureInteractionIdeas":[""],"brief":"at most 900 characters: the features and the angle a planner should use, in plain sentences"}`;

export function researchRequest(idea: string): string {
  return `App idea, in the user's words:\n${idea}`;
}

/** What the planner sees: the brief plus the competitors' complaints to design against. */
export function researchForPlanner(research: ResearchBrief): string {
  const complaints = research.competitors
    .filter((c) => c.complaints.length)
    .slice(0, 5)
    .map((c) => `- ${c.name}: ${c.complaints.slice(0, 2).join("; ")}`)
    .join("\n");
  return `Market research (from the web, for this idea):\n${research.brief}${
    complaints ? `\nWhat users of competing apps complain about:\n${complaints}` : ""
  }\nUse it to choose the features and the angle; the user's own words still win.`;
}

// --- Design direction ------------------------------------------------------------------------

export function designSystem(plan: AppPlan): string {
  const theme = plan.themes[0];
  return `You are the lead product designer for an iPhone app. From the plan and the market research, set a distinctive, premium visual direction (not a generic template look) and brief every screen for a high-fidelity mockup.

What the app's code can do: React Native and Expo; solid colors, linear gradients, rounded cards, shadows, shapes made of views, images (generated illustrations, and a mascot as transparent PNGs), system fonts with strong weights. Drawing with SVG (rings, gauges, ribbons, curves, charts, custom shapes). Motion: content that rises in, staggered lists, cards that spring on press, numbers that count up, bars that grow, one gently floating hero picture, custom React Native Animated motion (fades, slides, scales, loops, animated SVG), drag gestures (handles, sliders, swipes), haptic taps, shimmering loading skeletons, onboarding steps that slide with page dots, a pulsing paywall button, tab switches that glide, and built-in themed Lottie animations (a success check, a confetti celebration, loading dots, a heart pop, a premium sparkle). No custom Lottie files, 3D or physics engines. Plan motion within that. Don't design blur-heavy glass walls, 3D renders as UI, or device frames. Use native iOS patterns: a tab bar at the bottom for tab screens, large titles where they fit, 44pt touch targets, and real, readable copy (no lorem ipsum).

Use the plan's first theme for the mockups: "${theme?.name ?? "the first theme"}", primary ${theme?.primary ?? "(choose one)"}, ${theme?.dark ? "dark" : "light"}. Keep palette.primary equal to that primary.

Mascot: set mascot.use to true only if a character truly fits this app (habit, learning, wellness and kids' apps often; finance, tools and utilities rarely). With a mascot, give 3 poses (the first is the neutral one every other pose is drawn from) and use it in the screen briefs where it helps. Without one, set use to false and leave the other mascot fields empty.

Give exactly one screen brief per plan screen, in the plan's order, with its exact path. A brief lists, top to bottom, every element on the screen with its real copy and realistic data. For onboarding, show the most important step.`;
}

export function designRequest(plan: AppPlan, research: ResearchBrief | null): string {
  return `PLAN:\n${JSON.stringify(plan)}\n\nRESEARCH:\n${research ? JSON.stringify(research) : "(none)"}`;
}

// --- Image prompts -------------------------------------------------------------------------

/** The direction's look in words: for the image model, and for a build model without vision. */
export function directionStyle(d: DesignDirection): string {
  return `Visual direction "${d.styleName}": ${d.summary}
Palette: background ${d.palette.background}, surface ${d.palette.surface}, text ${d.palette.text}, muted text ${d.palette.mutedText}, primary ${d.palette.primary}, accent ${d.palette.accent}, success ${d.palette.success}.
Typography: display ${d.typography.display}, body ${d.typography.body}. ${d.typography.notes}
Shape: corner radius ${d.shape.cornerRadius}px; cards: ${d.shape.cards}; shadows: ${d.shape.shadows}.
Illustration style: ${d.illustrationStyle}`;
}

function styleBlock(plan: AppPlan, d: DesignDirection): string {
  return `App: ${plan.appName}. ${directionStyle(d)}`;
}

export function mascotPosePrompt(
  plan: AppPlan,
  d: DesignDirection,
  pose: { name: string; description: string },
  fromReference: boolean,
  note?: string,
): string {
  const m = d.mascot!;
  return `${fromReference ? `The same character as the reference image: identical design, colors, proportions and line style. ` : ""}Character design for the mascot "${m.name}" of the iPhone app ${plan.appName}. ${m.look}. Personality: ${m.personality}. ${d.illustrationStyle}. Pose: ${pose.description}${note ? `\nThe user asked for this change: ${note}` : ""}
Draw ONLY the character, full body, centered with a generous margin, on a plain solid pure green (#00FF00) background. Nothing else in the image: no hands, no sketches, no other objects unless the pose needs one, no text, no shadow, no ground, no border.`;
}

export function screenMockupPrompt(
  plan: AppPlan,
  d: DesignDirection,
  screen: { path: string; title: string; mockupBrief: string },
  options: {
    /** What the reference images are, in order (e.g. the main screen to match, the mascot). */
    references: string[];
    tabScreen: boolean;
    note?: string;
  },
): string {
  const refs = options.references.map((r, i) => `Reference image ${i + 1}: ${r}`).join("\n");
  return `High-fidelity iPhone app UI mockup of ONE screen, portrait. The screen fills the whole image edge to edge: no phone, no bezel, no notch cut-out, no hands, no background around it, no annotations. iOS status bar at the top showing 9:41, the home indicator at the bottom. Crisp, readable text with real copy. Polished and distinctive, App Store featured quality.
Never print design notes as text in the UI: no font names, hex colors, pixel or point sizes.
${styleBlock(plan, d)}
${d.mascot ? `The app's mascot is ${d.mascot.name}: ${d.mascot.look}. Draw it exactly like its reference image.` : ""}
Screen: "${screen.title}" (${screen.path}). ${screen.mockupBrief}
${options.tabScreen ? "It has the app's tab bar at the bottom." : "This screen has no tab bar."}
${refs}${options.note ? `\nThe user asked for this change: ${options.note}` : ""}`;
}

export function fixMockupPrompt(fixes: string[]): string {
  return `Edit this app screen mockup. ${fixes.join(" ")} Keep everything else exactly the same: layout, colors, type, mascot, copy and data.`;
}

// --- Reviewers ---------------------------------------------------------------------------------

export const RATE_SYSTEM = `You review app mockups for a builder that turns approved mockups into React Native code. Be strict and specific.`;

export function rateRequest(screenBrief: string, styleSummary: string): string {
  return `Two mockup options for the main screen. Brief: ${screenBrief}\nDirection: ${styleSummary}\nScore each from 1 to 10 on planFit (shows the brief's features and copy), readability, visualQuality, distinctiveness, nativeIOS (iPhone conventions, touch targets) and buildable (can be built with React Native, no impossible effects). Pick the winner (1 or 2).`;
}

export const RATE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["options", "winner", "why"],
  properties: {
    options: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "option",
          "planFit",
          "readability",
          "visualQuality",
          "distinctiveness",
          "nativeIOS",
          "buildable",
          "notes",
        ],
        properties: {
          option: { type: "integer" },
          planFit: { type: "number" },
          readability: { type: "number" },
          visualQuality: { type: "number" },
          distinctiveness: { type: "number" },
          nativeIOS: { type: "number" },
          buildable: { type: "number" },
          notes: { type: "string" },
        },
      },
    },
    winner: { type: "integer" },
    why: { type: "string" },
  },
} as const;

export const CHECK_SYSTEM = `You check app mockups before a user sees them. Flag only real problems.`;

export const CHECK_REQUEST = `The first image is the app's main screen; the second is another mockup to check.
- phoneFrame: true ONLY if a physical phone is drawn around the screen (a dark bezel, or a notch / Dynamic Island cut-out with background visible outside the device). Rounded screen corners and an iOS status bar are normal and are NOT a phone frame.
- multipleScreens: true if the image shows more than one app screen (two or more phones or screens side by side).
- leakedText: text that is a design note rather than UI copy (font names, hex colors, pixel or point sizes, "radius", spec labels). Empty when there is none.
- problems: garbled or broken text, or duplicated elements. Empty when there are none.`;

export const CHECK_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["phoneFrame", "multipleScreens", "leakedText", "problems"],
  properties: {
    phoneFrame: { type: "boolean" },
    multipleScreens: { type: "boolean" },
    leakedText: { type: "array", items: { type: "string" } },
    problems: { type: "array", items: { type: "string" } },
  },
} as const;
