// What premium unlocks and how it's sold. Written from the plan; edit it to change prices.
import type { Monetization } from "./purchases";

export const monetization: Monetization = {
  premiumFeatures: [],
  offers: [
    {
      id: "yearly",
      label: "Yearly",
      price: "$29.99",
      period: "year",
      trialDays: 7,
      badge: "Best value",
    },
    { id: "monthly", label: "Monthly", price: "$4.99", period: "month", trialDays: 0, badge: "" },
  ],
  defaultOfferId: "yearly",
};
