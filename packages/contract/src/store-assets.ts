/**
 * What App Builder prepares for an app's App Store submission, from the app's own plan and
 * files: the icon's prompt, the framed screenshots (one framing for the builder's dialog and the
 * worker), the App Store category, default age-rating answers, the App Privacy answers to click
 * in (Apple has no API for those) and the notes for App Review.
 */
import type { AppDataPractices } from "./app-privacy";
import type { AppPlan } from "./app-plan";

/** The master screenshot size: 6.9" iPhone portrait. Smaller sizes are cut from it. */
export const STORE_SHOT_SIZE = { width: 1320, height: 2868 } as const;
/** The App Store icon: 1024 px square, no transparency. */
export const STORE_ICON_SIZE = 1024;

/** The prompt for the app's icon, drawn by the image model. */
export function iconPrompt(plan: AppPlan, primary: string): string {
  const theme = plan.themes[0];
  return [
    `An iOS app icon for "${plan.appName}": ${plan.summary}`,
    plan.angle ? `Its point of view: ${plan.angle}.` : "",
    `One bold, simple symbol of what the app is about, centered and filling about 60% of the square, on a full-bleed background in ${primary}${theme?.mood ? ` (mood: ${theme.mood})` : ""} with a subtle gradient.`,
    "Flat and modern, high contrast, readable at small sizes.",
    "No text, letters, numbers or words. No rounded corners, border, shadow around the square, device frame or transparency: the square is filled edge to edge.",
  ]
    .filter(Boolean)
    .join(" ");
}

/** Black or white, whichever reads better on a #RRGGBB color. */
export function readableOn(hex: string): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return "#ffffff";
  const n = parseInt(m[1]!, 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
  return luminance > 0.4 ? "#111111" : "#ffffff";
}

export interface FrameInput {
  /** The screen as a PNG data URL. */
  png: string;
  caption: string;
  width: number;
  height: number;
  primary: string;
  onPrimary: string;
}

/**
 * A store screenshot: the caption over the app's color, the screen in a rounded frame below.
 * Browser code with no outside references, so the worker can run it in its headless Chrome
 * (`page.evaluate`) exactly as the builder's Store listing dialog does. Resolves a PNG data URL.
 */
export async function frameStoreShot(input: FrameInput): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read the screenshot."));
    img.src = input.png;
  });
  const canvas = document.createElement("canvas");
  canvas.width = input.width;
  canvas.height = input.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = input.primary;
  ctx.fillRect(0, 0, input.width, input.height);
  const shade = ctx.createLinearGradient(0, 0, 0, input.height);
  shade.addColorStop(0, "rgba(255,255,255,0.10)");
  shade.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, input.width, input.height);

  // Caption: up to three lines, centered.
  const fontSize = Math.round(input.width * 0.068);
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = input.onPrimary;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const lines: string[] = [];
  let line = "";
  for (const word of input.caption.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > input.width * 0.84 && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  const shown = lines.slice(0, 3);
  const top = input.height * 0.055;
  shown.forEach((l, i) => ctx.fillText(l, input.width / 2, top + i * fontSize * 1.18));

  // The screen, scaled to fit under the caption.
  const areaTop = top + shown.length * fontSize * 1.18 + input.height * 0.035;
  const maxHeight = input.height - areaTop - input.height * 0.04;
  const scale = Math.min((input.width * 0.82) / image.width, maxHeight / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  const x = (input.width - w) / 2;
  const radius = w * 0.09;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = input.width * 0.04;
  ctx.shadowOffsetY = input.width * 0.012;
  ctx.beginPath();
  ctx.roundRect(x, areaTop, w, h, radius);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, areaTop, w, h, radius);
  ctx.clip();
  ctx.drawImage(image, x, areaTop, w, h);
  ctx.restore();
  return canvas.toDataURL("image/png");
}

/** App Store category ids (GET /v1/appCategories, iOS, top level). */
export const ASC_CATEGORIES = [
  "BOOKS",
  "BUSINESS",
  "DEVELOPER_TOOLS",
  "EDUCATION",
  "ENTERTAINMENT",
  "FINANCE",
  "FOOD_AND_DRINK",
  "GAMES",
  "GRAPHICS_AND_DESIGN",
  "HEALTH_AND_FITNESS",
  "LIFESTYLE",
  "MAGAZINES_AND_NEWSPAPERS",
  "MEDICAL",
  "MUSIC",
  "NAVIGATION",
  "NEWS",
  "PHOTO_AND_VIDEO",
  "PRODUCTIVITY",
  "REFERENCE",
  "SHOPPING",
  "SOCIAL_NETWORKING",
  "SPORTS",
  "TRAVEL",
  "UTILITIES",
  "WEATHER",
] as const;

/** The App Store category id for a listing's category ("Health & Fitness"), or null. */
export function ascCategoryId(category: string): string | null {
  const id = category
    .trim()
    .toUpperCase()
    .replace(/&/g, " AND ")
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
  return (ASC_CATEGORIES as readonly string[]).includes(id) ? id : null;
}

/**
 * Age-rating answers for an app built on App Builder: none of the content questions apply to
 * what the platform builds (no violence, gambling, web browser, ads, chat between people or
 * user-generated content shared with others), except health topics for a health app. Only the
 * questions the owner hasn't answered are sent.
 */
export function ageRatingAnswers(categoryId: string | null): Record<string, string | boolean> {
  const none = [
    "alcoholTobaccoOrDrugUseOrReferences",
    "contests",
    "gamblingSimulated",
    "gunsOrOtherWeapons",
    "horrorOrFearThemes",
    "matureOrSuggestiveThemes",
    "medicalOrTreatmentInformation",
    "profanityOrCrudeHumor",
    "sexualContentGraphicAndNudity",
    "sexualContentOrNudity",
    "violenceCartoonOrFantasy",
    "violenceRealistic",
    "violenceRealisticProlongedGraphicOrSadistic",
  ];
  const no = [
    "advertising",
    "ageAssurance",
    "gambling",
    "lootBox",
    "messagingAndChat",
    "parentalControls",
    "socialMedia",
    "socialMediaAgeRestricted",
    "unrestrictedWebAccess",
    "userGeneratedContent",
  ];
  return {
    ...Object.fromEntries(none.map((k) => [k, "NONE"])),
    ...Object.fromEntries(no.map((k) => [k, false])),
    healthOrWellnessTopics: categoryId === "HEALTH_AND_FITNESS" || categoryId === "MEDICAL",
  };
}

export interface PrivacyAnswer {
  /** As App Store Connect names it, e.g. "Email Address". */
  dataType: string;
  purpose: string;
  linkedToUser: boolean;
}

/**
 * The App Privacy ("nutrition label") answers for the app, from what it really uses. Apple has
 * no API for them, so the owner clicks them in (App Store Connect → App Privacy). None of them
 * is used for tracking. AI questions and photos are only processed to answer and aren't kept,
 * which Apple doesn't count as collected.
 */
export function privacyAnswers(p: AppDataPractices): PrivacyAnswer[] {
  const answers: PrivacyAnswer[] = [
    { dataType: "Crash Data", purpose: "App Functionality", linkedToUser: false },
    { dataType: "Other Diagnostic Data", purpose: "App Functionality", linkedToUser: false },
  ];
  if (p.accounts)
    answers.push(
      { dataType: "Email Address", purpose: "App Functionality", linkedToUser: true },
      { dataType: "Name", purpose: "App Functionality", linkedToUser: true },
    );
  if (p.cloud)
    answers.push({
      dataType: "Other User Content",
      purpose: "App Functionality",
      linkedToUser: true,
    });
  if (p.cloud && (p.camera || p.photos))
    answers.push({
      dataType: "Photos or Videos",
      purpose: "App Functionality",
      linkedToUser: true,
    });
  if (p.cloud && p.location)
    answers.push({
      dataType: "Precise Location",
      purpose: "App Functionality",
      linkedToUser: true,
    });
  if (p.analytics)
    answers.push({ dataType: "Product Interaction", purpose: "Analytics", linkedToUser: false });
  if (p.push)
    answers.push({ dataType: "Device ID", purpose: "App Functionality", linkedToUser: true });
  if (p.purchases)
    answers.push({
      dataType: "Purchase History",
      purpose: "App Functionality",
      linkedToUser: true,
    });
  if (p.supportChat)
    answers.push({
      dataType: "Customer Support",
      purpose: "App Functionality",
      linkedToUser: true,
    });
  return answers;
}

/** The notes for App Review: what the app does, how to try it, and what to know. */
export function reviewNotes(input: {
  plan: AppPlan | null;
  practices: AppDataPractices;
  appName: string;
  demoAccount: { email: string; password: string } | null;
  supportUrl: string;
}): string {
  const { plan, practices: p } = input;
  const lines = [
    plan ? `${input.appName}: ${plan.summary}` : input.appName,
    plan?.coreLoop ? `How to try it: ${plan.coreLoop}.` : "",
    plan?.habit?.daily
      ? `Every day: ${plan.habit.daily}. Optional morning and evening reminders are scheduled on the phone, only after the person turns them on.`
      : "",
    input.demoAccount
      ? `Sign in with the demo account: ${input.demoAccount.email} / ${input.demoAccount.password}. Accounts are optional; the app also works without one.`
      : p.accounts
        ? "Accounts are optional; the app works without one."
        : "No account is needed.",
    "Premium is an auto-renewing subscription sold through Apple (StoreKit). The paywall can be closed, and Restore Purchases is on the paywall and in Settings. Use a Sandbox account to test a purchase.",
    p.ai
      ? "AI answers come from Anthropic's model; what people ask is only used to answer and isn't kept."
      : "",
    p.accounts ? "Settings → Delete account deletes the account and its data in the app." : "",
    `Support: ${input.supportUrl}`,
  ];
  return lines.filter(Boolean).join("\n\n").slice(0, 3900);
}
