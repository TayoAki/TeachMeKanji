import { Check } from "lucide-react";
import { CREDIT_USD, PLANS, userPlan } from "@appbuilder/core";
import { SiteHeader } from "@/components/marketing/site-header";
import { UpgradeButton } from "@/components/upgrade-button";
import { db, getViewer } from "@/lib/server";

export const metadata = { title: "Pricing" };

export default async function PricingPage() {
  const viewer = await getViewer();
  const plan = viewer ? await userPlan(db(), viewer.id) : null;
  const enabled = Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_PRO);
  const tiers = [
    {
      id: "free" as const,
      features: [
        `${PLANS.free.signupCredits} credits to start`,
        `${PLANS.free.maxProjects} projects`,
        `Up to ${PLANS.free.maxScreensPerProject} screens per app`,
        "Live preview, on-phone preview, inline editing",
        "Download source, push to GitHub, publish to the web",
      ],
    },
    {
      id: "pro" as const,
      features: [
        `${PLANS.pro.monthlyCredits} credits every month`,
        "Unlimited projects",
        `Up to ${PLANS.pro.maxScreensPerProject} screens per app`,
        "Android (APK/AAB) and iOS (IPA) builds",
        "Everything in Free",
      ],
    },
  ];
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-4xl px-4 py-16">
        <h1 className="text-center text-4xl font-semibold tracking-tight">Simple pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          Credits pay for the AI work. A typical new app (plan + 5 screens) uses about 30 credits;
          most edits use 2–5. Failed runs are free.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-2">
          {tiers.map((tier) => (
            <div key={tier.id} className="flex flex-col rounded-2xl border bg-background p-6">
              <h2 className="text-lg font-semibold">{PLANS[tier.id].name}</h2>
              <p className="mt-2">
                <span className="text-4xl font-semibold">${PLANS[tier.id].priceUsdPerMonth}</span>
                <span className="text-muted-foreground"> / month</span>
              </p>
              <ul className="my-6 flex-1 space-y-2 text-sm">
                {tier.features.map((f) => (
                  <li key={f} className="flex gap-2">
                    <Check className="size-4 shrink-0 text-emerald-600" /> {f}
                  </li>
                ))}
              </ul>
              {tier.id === "pro" ? (
                <UpgradeButton
                  signedIn={Boolean(viewer)}
                  enabled={enabled}
                  current={plan === "pro"}
                />
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          1 credit ≈ ${CREDIT_USD.toFixed(2)} of AI usage.
        </p>
      </main>
    </>
  );
}
