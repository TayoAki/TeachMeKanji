// What the person told us in onboarding (and changed in Settings), and today's free-plan usage.
import { setAnswer, useAppState } from "../data/app-state";
import { usePurchases } from "../data/purchases";
import { useCollection } from "../data/repo";
import { FREE_LIMITS, dayKey, type Look } from "../data/schema";
import { defaultUnit, type Place } from "./weather";

export const WEAR_OPTIONS = [
  { id: "womenswear", label: "Womenswear" },
  { id: "menswear", label: "Menswear" },
  { id: "both", label: "A mix of both" },
];

export const AGE_OPTIONS = ["Under 13", "13–17", "18–24", "25–34", "35–44", "45+"];

export const STYLE_OPTIONS = [
  "Minimal",
  "Classic",
  "Smart casual",
  "Streetwear",
  "Sporty",
  "Romantic",
  "Boho",
  "Edgy",
];

export function useProfile() {
  const { answers } = useAppState();
  let place: Place | null = null;
  try {
    place = answers.place ? (JSON.parse(answers.place) as Place) : null;
  } catch {
    place = null;
  }
  const unit = answers.unit === "f" || answers.unit === "c" ? answers.unit : defaultUnit();
  return {
    wear: answers.wear ?? "",
    age: answers.age ?? "",
    styles: (answers.styles ?? "").split(",").filter(Boolean),
    place,
    unit: unit as "c" | "f",
    photoNoticeSeen: answers.photoNotice === "1",
  };
}

export function savePlace(place: Place | null): Promise<void> {
  return setAnswer("place", place ? JSON.stringify(place) : "");
}

/** Which basics to offer: "w", "m" or both, from what they said they wear. */
export function wearCodes(wear: string): ("w" | "m" | "a")[] {
  if (wear === "womenswear") return ["w", "a"];
  if (wear === "menswear") return ["m", "a"];
  return ["w", "m", "a"];
}

/** How much of today's free allowance is used, and whether more is allowed. */
export function useAllowance() {
  const { isPremium } = usePurchases();
  const { answers } = useAppState();
  const looks = useCollection<Look>("looks");
  const today = dayKey();
  const scans = looks.items.filter((l) => l.kind === "shop" && l.date === today).length;
  const ratings = looks.items.filter((l) => l.kind === "rate" && l.date === today).length;
  const rerolls = answers.rerollDay === today ? Number(answers.rerolls ?? "0") : 0;
  return {
    isPremium,
    canScan: isPremium || scans < FREE_LIMITS.scansPerDay,
    canRate: isPremium || ratings < FREE_LIMITS.ratingsPerDay,
    canReroll: isPremium || rerolls < FREE_LIMITS.rerollsPerDay,
    rerollsLeft: Math.max(0, FREE_LIMITS.rerollsPerDay - rerolls),
    async countReroll() {
      await setAnswer("rerollDay", today);
      await setAnswer("rerolls", String(rerolls + 1));
    },
  };
}
