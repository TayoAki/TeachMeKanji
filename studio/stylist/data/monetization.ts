// What premium unlocks and how it's sold.
import type { Monetization } from "./purchases";

export const monetization: Monetization = {
  premiumFeatures: [
    "A new outfit option whenever you want one",
    "Unlimited closet, beyond 15 pieces",
    "Shop the look: unlimited scans with links to every piece",
    "Unlimited fit ratings with swaps from your closet",
  ],
  offers: [
    {
      id: "yearly",
      label: "Yearly",
      price: "$39.99",
      period: "year",
      trialDays: 3,
      badge: "$0.77 a week",
    },
    { id: "monthly", label: "Monthly", price: "$9.99", period: "month", trialDays: 0, badge: "" },
  ],
  defaultOfferId: "yearly",
};
