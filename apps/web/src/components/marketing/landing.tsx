"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, ClipboardCheck, Gauge, History, PencilLine, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PromptBox } from "@/components/prompt-box";
import { ProjectCard, type ProjectCardData } from "@/components/project-card";

/** The cost promises are product facts: free inspector/text edits, free restores, no overages. */
const NO_SURPRISES = [
  {
    icon: PencilLine,
    title: "Change it yourself, free",
    body: "Double-click any text, or change colours and spacing in the inspector. No credits, no prompt.",
  },
  {
    icon: History,
    title: "Never pay for our mistakes",
    body: "A step that fails is free, so are the AI's repairs of its own code, and undoing an AI edit within a day gives its credits back.",
  },
  {
    icon: ShieldCheck,
    title: "No overage charges",
    body: "When your credits run out, the AI stops and tells you. Your card is never charged extra.",
  },
  {
    icon: Gauge,
    title: "Know the cost first",
    body: "A new app uses about 60–90 credits and a chat edit 5–15. One credit is $0.05 of AI.",
  },
];

/** What every app gets, checked on every build (packages/contract/src/quality.ts). */
const STORE_CHECKS = [
  "A paywall people can close",
  "Price and billing period on every plan",
  "Free-trial terms before purchase",
  "Auto-renewal stated on the paywall",
  "Restore Purchases on the paywall and in Settings",
  "Privacy and terms links",
  "A way to contact support",
  "The app version in Settings",
];

const FAQ = [
  {
    q: "What's a credit?",
    a: "One credit is $0.05 of AI usage, charged at what each step actually used. Planning and building a new app usually takes 60–90 credits; a chat edit 5–15. Editing text and styles yourself and restoring a version are free.",
  },
  {
    q: "Can I be charged more than my plan?",
    a: "No. When your credits run out, AI steps stop until you have more. There are no overage charges.",
  },
  {
    q: "Who submits my app to Apple?",
    a: "You do, from your own Apple developer account: Apple asks that apps made with app-generation services be submitted by the person whose app it is (guideline 4.2.6). App Builder makes the build and uploads it with your keys.",
  },
  {
    q: "Do I own the code?",
    a: "Yes. Download the Expo / React Native source or push it to GitHub whenever you like.",
  },
  {
    q: "Can I cancel any time?",
    a: "Yes, in Settings. Your plan runs to the end of the month you paid for.",
  },
];

export function Landing({ community }: { community: ProjectCardData[] }) {
  const router = useRouter();
  return (
    <main>
      <section className="mx-auto flex max-w-3xl flex-col items-center gap-6 px-4 pb-12 pt-20 text-center">
        <span className="rounded-full border px-3 py-1 text-xs text-muted-foreground">
          For first-time founders · iOS & Android
        </span>
        <h1 className="text-balance text-4xl font-semibold tracking-tight sm:text-5xl">
          Build a subscription app without the surprise bill.
        </h1>
        <p className="max-w-2xl text-balance text-lg text-muted-foreground">
          Describe your habit, learning or wellness app. It arrives with onboarding, a paywall and
          settings checked against App Store rules on every build — and you change text yourself for
          free, roll back for free, and never pay overages.
        </p>
        <div className="w-full text-left">
          <PromptBox
            onSubmit={({ prompt }) => router.push(`/sign-up?prompt=${encodeURIComponent(prompt)}`)}
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Start free with 100 credits — about one app. No card needed.
        </p>
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20">
        <video
          className="w-full rounded-xl border shadow-sm"
          src="/film/launch.mp4"
          poster="/film/poster.jpg"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          aria-label="A subscription app being built in App Builder: plan, build, edit text, store listing"
        />
      </section>

      <section className="mx-auto max-w-5xl px-4 pb-20" data-testid="no-surprises">
        <h2 className="text-balance text-2xl font-semibold tracking-tight">
          Your credits go into the app, not into repairs
        </h2>
        <div className="mt-6 grid gap-4 sm:grid-cols-2">
          {NO_SURPRISES.map(({ icon: Icon, title, body }) => (
            <div key={title} className="rounded-xl border bg-background p-5">
              <Icon className="size-5 text-muted-foreground" />
              <h3 className="mt-3 font-medium">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-10 px-4 pb-20 md:grid-cols-2">
        <div>
          <h2 className="text-balance text-2xl font-semibold tracking-tight">
            Built to sell, not just to demo
          </h2>
          <p className="mt-3 text-muted-foreground">
            Every app is a subscription business from the first build: onboarding that asks a
            question, a paywall, the main app and settings. Real purchases run through RevenueCat,
            and the store listing copy and framed screenshots are written for you.
          </p>
          <Button asChild variant="outline" className="mt-5">
            <Link href="/check">
              <ClipboardCheck /> Check your own app in 3 minutes
            </Link>
          </Button>
        </div>
        <div className="rounded-xl border bg-background p-5">
          <p className="text-sm font-medium">Checked on every build</p>
          <ul className="mt-3 space-y-2 text-sm text-muted-foreground">
            {STORE_CHECKS.map((item) => (
              <li key={item} className="flex gap-2">
                <Check className="mt-0.5 size-4 shrink-0 text-green-600" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="mx-auto max-w-3xl px-4 pb-20" data-testid="faq">
        <h2 className="text-2xl font-semibold tracking-tight">Questions</h2>
        <dl className="mt-6 divide-y rounded-xl border">
          {FAQ.map(({ q, a }) => (
            <div key={q} className="p-5">
              <dt className="font-medium">{q}</dt>
              <dd className="mt-1 text-sm text-muted-foreground">{a}</dd>
            </div>
          ))}
        </dl>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Button asChild size="lg">
            <Link href="/sign-up">Start free — 100 credits</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/pricing">See plans</Link>
          </Button>
        </div>
      </section>

      {community.length > 0 ? (
        <section className="mx-auto max-w-6xl px-4 pb-24" id="community">
          <h2 className="mb-4 text-lg font-semibold">Built with App Builder</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {community.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        </section>
      ) : null}
    </main>
  );
}
