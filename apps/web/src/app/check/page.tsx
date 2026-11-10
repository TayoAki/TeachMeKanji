import Image from "next/image";
import { SiteFooter } from "@/components/marketing/site-footer";
import { SiteHeader } from "@/components/marketing/site-header";
import { StoreCheck } from "@/components/marketing/store-check";

export const metadata = {
  title: "App Store check for subscription apps",
  description:
    "Ten questions App Review asks of a subscription app, scored for yours in 3 minutes, with the fix for each.",
};

export default function CheckPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto max-w-5xl px-4 py-16">
        <div className="grid items-center gap-10 md:grid-cols-[1fr_280px]">
          <div>
            <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
              Free · 3 minutes · for any app, built anywhere
            </span>
            <h1 className="mt-4 text-balance text-4xl font-semibold tracking-tight">
              Get into the App Store and get paid: check your subscription app in 3 minutes
            </h1>
            <ul className="mt-5 space-y-2 text-muted-foreground">
              <li>Catch the missing Restore Purchases button before App Review does.</li>
              <li>
                Fix your trial and renewal wording so buyers trust what they&rsquo;re paying for.
              </li>
              <li>
                Launch knowing exactly what&rsquo;s left — and nothing you&rsquo;ll pay to redo.
              </li>
            </ul>
          </div>
          <Image
            src="/film/paywall-check.jpg"
            alt="A subscription paywall showing each plan's price and period, the trial terms, Restore Purchases and the renewal terms"
            width={560}
            height={714}
            className="mx-auto w-64 rounded-2xl border shadow-sm md:w-full"
            priority
          />
        </div>
        <div className="mt-14 max-w-3xl">
          <StoreCheck />
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
