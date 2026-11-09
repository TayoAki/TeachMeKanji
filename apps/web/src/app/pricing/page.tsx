import { Check } from "lucide-react";
import { CREDIT_USD, PLANS, userPlan, type PlanId } from "@appbuilder/core";
import { SiteHeader } from "@/components/marketing/site-header";
import { UpgradeButton } from "@/components/upgrade-button";
import { db, getViewer } from "@/lib/server";
import { billingAvailability } from "@/lib/stripe";

export const metadata = { title: "Pricing" };

export default async function PricingPage() {
  const viewer = await getViewer();
  const plan = viewer ? await userPlan(db(), viewer.id) : null;
  const billing = billingAvailability();
  const tiers: Array<{ id: PlanId; tagline: string; features: string[] }> = [
    {
      id: "free",
      tagline: "Try it with built-in AI.",
      features: [
        `${PLANS.free.signupCredits} credits to start`,
        `${PLANS.free.maxProjects} projects`,
        `Up to ${PLANS.free.maxScreensPerProject} screens per app`,
        "Live preview, on-phone preview, inline editing",
        "Download source, push to GitHub, publish to the web",
      ],
    },
    {
      id: "studio",
      tagline: "Bring the AI you already pay for.",
      features: [
        "Build from Claude, ChatGPT or Cursor through MCP: no credits needed",
        "Unlimited projects",
        `Up to ${PLANS.studio.maxScreensPerProject} screens per app`,
        "App Cloud: accounts and data for your apps",
        "Android (APK/AAB) and iOS (IPA) builds",
      ],
    },
    {
      id: "pro",
      tagline: "Built-in AI, plus everything in Studio.",
      features: [
        `${PLANS.pro.monthlyCredits} credits every month for the built-in agent`,
        "Everything in Studio, including MCP",
      ],
    },
  ];
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-16">
        <h1 className="text-center text-4xl font-semibold tracking-tight">Simple pricing</h1>
        <p className="mx-auto mt-3 max-w-xl text-center text-muted-foreground">
          Use the built-in agent with credits, or connect your own Claude, ChatGPT or Cursor and
          build without paying for AI twice.
        </p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {tiers.map((tier) => (
            <div
              key={tier.id}
              className="flex flex-col rounded-2xl border bg-background p-6"
              data-testid={`plan-${tier.id}`}
            >
              <h2 className="text-lg font-semibold">{PLANS[tier.id].name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{tier.tagline}</p>
              <p className="mt-3">
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
              {tier.id !== "free" ? (
                <UpgradeButton
                  plan={tier.id}
                  name={PLANS[tier.id].name}
                  signedIn={Boolean(viewer)}
                  enabled={billing[tier.id]}
                  current={plan === tier.id}
                />
              ) : null}
            </div>
          ))}
        </div>
        <p className="mt-8 text-center text-xs text-muted-foreground">
          1 credit ≈ ${CREDIT_USD.toFixed(2)} of AI usage. A new app (plan + 5 screens) uses about
          30 credits; most edits use 2–5. Failed runs are free.
        </p>
      </main>
    </>
  );
}
