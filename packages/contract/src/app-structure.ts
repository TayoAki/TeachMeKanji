/**
 * Every generated app has four parts: onboarding (first launch), a paywall, the main app (the
 * plan's tabs and stack screens) and settings. The three structure screens live at fixed
 * routes; the template's root layout gates on data/app-structure.ts, which the platform keeps in
 * step with the files (a structure screen the user deletes is simply skipped).
 */
import { isScreenFile, type ProjectFiles } from "./layout";

export type ScreenRole = "onboarding" | "paywall" | "main" | "settings";

export const STRUCTURE_SCREENS = {
  onboarding: "app/onboarding.tsx",
  paywall: "app/paywall.tsx",
  settings: "app/settings.tsx",
} as const;

export type StructureRole = keyof typeof STRUCTURE_SCREENS;

export const APP_STRUCTURE_FILE = "data/app-structure.ts";
export const MONETIZATION_FILE = "data/monetization.ts";
export const APP_INFO_FILE = "data/app-info.ts";

export function isStructureScreen(path: string): boolean {
  return (Object.values(STRUCTURE_SCREENS) as string[]).includes(path);
}

export function structureRoleOf(path: string): StructureRole | null {
  for (const [role, file] of Object.entries(STRUCTURE_SCREENS))
    if (file === path) return role as StructureRole;
  return null;
}

/** Screens that count toward a plan's per-project screen limit (structure screens don't). */
export function countLimitedScreens(files: ProjectFiles | string[]): number {
  const paths = Array.isArray(files) ? files : Object.keys(files);
  return paths.filter((p) => isScreenFile(p) && !isStructureScreen(p)).length;
}

export function appStructureFile(files: ProjectFiles): string {
  const has = (role: StructureRole) => files[STRUCTURE_SCREENS[role]] !== undefined;
  return `// PLATFORM FILE — written by the platform from the screens the app has.
/** Which of the app's structure screens exist (onboarding, paywall, settings). */
export const appStructure = {
  onboarding: ${has("onboarding")},
  paywall: ${has("paywall")},
  settings: ${has("settings")},
};
`;
}

/** Keep data/app-structure.ts in step with the files (call after any change to app/). */
export function withAppStructure(files: ProjectFiles): ProjectFiles {
  const content = appStructureFile(files);
  return files[APP_STRUCTURE_FILE] === content
    ? files
    : { ...files, [APP_STRUCTURE_FILE]: content };
}

export interface PlanOffer {
  id: string;
  label: string;
  price: string;
  period: "week" | "month" | "year" | "lifetime";
  trialDays: number;
  badge: string;
}

export interface PlanMonetization {
  premiumFeatures: string[];
  offers: PlanOffer[];
}

export const DEFAULT_OFFERS: PlanOffer[] = [
  {
    id: "yearly",
    label: "Yearly",
    price: "$29.99",
    period: "year",
    trialDays: 7,
    badge: "Best value",
  },
  { id: "monthly", label: "Monthly", price: "$4.99", period: "month", trialDays: 0, badge: "" },
];

/** data/monetization.ts from the plan (the model may edit it later, e.g. to change prices). */
export function monetizationFile(monetization: PlanMonetization): string {
  const offers = monetization.offers.length ? monetization.offers : DEFAULT_OFFERS;
  const preferred = offers.find((o) => o.badge) ?? offers[0]!;
  const body = JSON.stringify(
    { premiumFeatures: monetization.premiumFeatures, offers, defaultOfferId: preferred.id },
    null,
    2,
  );
  return `// What premium unlocks and how it's sold. Written from the plan; edit it to change prices.
import type { Monetization } from "./purchases";

export const monetization: Monetization = ${body};
`;
}

export interface AppInfo {
  name: string;
  version: string;
  supportEmail: string;
  privacyUrl: string;
  termsUrl: string;
}

export function appInfoFile(info: AppInfo): string {
  return `// Shown in Settings and on the paywall. Fill in the links before publishing to the stores:
// subscriptions need working Terms and Privacy links.
export const appInfo = ${JSON.stringify(info, null, 2)};
`;
}
