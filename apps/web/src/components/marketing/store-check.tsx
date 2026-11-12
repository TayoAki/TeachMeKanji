"use client";

import { useState } from "react";
import Link from "next/link";
import { CircleCheck, CircleX, Loader2 } from "lucide-react";
import { FUNNEL_SURVEY, STORE_CHECKS, type StoreCheckAnswer } from "@appbuilder/contract/protocol";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Results {
  token: string;
  passed: number;
  total: number;
  failed: Array<{ id: string; question: string; fix: string; why: string }>;
}

const CHOICES: Array<{ value: StoreCheckAnswer; label: string }> = [
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
  { value: "unsure", label: "Not sure" },
];

/** The App Store readiness check: questions → email → results and the fix list → survey. */
export function StoreCheck() {
  const [answers, setAnswers] = useState<Record<string, StoreCheckAnswer>>({});
  const [email, setEmail] = useState("");
  const [nurture, setNurture] = useState(false);
  const [website, setWebsite] = useState("");
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Results | null>(null);
  const answered = STORE_CHECKS.every((c) => answers[c.id]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      setResults(
        await api<Results>("/api/leads", {
          method: "POST",
          json: { email, answers, nurture, website },
        }),
      );
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      // api() already showed the error
    } finally {
      setBusy(false);
    }
  };

  if (results) return <CheckResults results={results} />;

  return (
    <form onSubmit={submit} className="space-y-8" data-testid="store-check">
      <ol className="space-y-3">
        {STORE_CHECKS.map((check, i) => (
          <li key={check.id} className="rounded-xl border bg-background p-4">
            <p className="text-sm font-medium">
              {i + 1}. {check.question}
            </p>
            <div className="mt-3 flex gap-2" role="radiogroup" aria-label={check.question}>
              {CHOICES.map((choice) => (
                <button
                  key={choice.value}
                  type="button"
                  role="radio"
                  aria-checked={answers[check.id] === choice.value}
                  onClick={() => setAnswers((a) => ({ ...a, [check.id]: choice.value }))}
                  className={cn(
                    "rounded-md border px-3 py-1.5 text-sm transition-colors",
                    answers[check.id] === choice.value
                      ? "border-foreground bg-foreground text-background"
                      : "hover:bg-muted",
                  )}
                  data-testid={`check-${check.id}-${choice.value}`}
                >
                  {choice.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>

      <div className="rounded-xl border bg-background p-5">
        <label htmlFor="check-email" className="text-sm font-medium">
          Where should we send your results?
        </label>
        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <Input
            id="check-email"
            type="email"
            required
            autoComplete="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button type="submit" disabled={!answered || busy} className="sm:w-48">
            {busy ? <Loader2 className="animate-spin" /> : null} Check my app
          </Button>
        </div>
        {/* Honeypot: hidden from people, filled by bots. */}
        <input
          type="text"
          name="website"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="hidden"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
        <label className="mt-3 flex items-start gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            className="mt-1"
            checked={nurture}
            onChange={(e) => setNurture(e.target.checked)}
            data-testid="check-nurture"
          />
          Also send me a few short emails on launching a subscription app. Unsubscribe anytime.
        </label>
        <p className="mt-2 text-xs text-muted-foreground">
          {answered ? "" : "Answer all 10 questions first. "}
          Your results show here straight away. See our{" "}
          <Link href="/privacy" className="underline">
            Privacy Policy
          </Link>
          .
        </p>
      </div>
    </form>
  );
}

function CheckResults({ results }: { results: Results }) {
  const { passed, total, failed } = results;
  return (
    <div className="space-y-8" data-testid="check-results">
      <div className="rounded-xl border bg-background p-6">
        <p className="text-sm text-muted-foreground">Your App Store check</p>
        <p className="mt-1 text-3xl font-semibold" data-testid="check-score">
          {passed} of {total} passed
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {failed.length === 0
            ? "Nothing to fix. Keep this list for your next app."
            : `Here's what to fix before you submit, with why App Review cares. "Not sure" counts as a fix, so you can check it.`}
        </p>
      </div>
      {failed.length ? (
        <ol className="space-y-3">
          {failed.map((item) => (
            <li key={item.id} className="rounded-xl border bg-background p-4">
              <p className="flex gap-2 text-sm font-medium">
                <CircleX className="mt-0.5 size-4 shrink-0 text-destructive" />
                {item.question}
              </p>
              <p className="mt-2 pl-6 text-sm">
                <strong>Fix:</strong> {item.fix}
              </p>
              <p className="mt-1 pl-6 text-sm text-muted-foreground">{item.why}</p>
            </li>
          ))}
        </ol>
      ) : null}
      <div className="rounded-xl border bg-muted/40 p-6">
        <p className="flex gap-2 font-medium">
          <CircleCheck className="mt-0.5 size-5 shrink-0 text-green-600" />
          Fixing these takes an afternoon. Wiring each one up prompt by prompt is where the money
          goes.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          App Builder&rsquo;s paywall covers price and period, trial terms, auto-renewal, Restore
          Purchases and a close button on every build, with onboarding and settings around it.
          Changing text yourself and restoring a version are free, and there are no overage charges.
        </p>
        <Button asChild className="mt-4">
          <Link href="/sign-up">Start free — 60 credits</Link>
        </Button>
      </div>
      <LeadSurvey token={results.token} />
    </div>
  );
}

/** The four questions after the check (also reachable from the results email). */
export function LeadSurvey({ token }: { token: string }) {
  const [stage, setStage] = useState("");
  const [challenge, setChallenge] = useState("");
  const [tools, setTools] = useState<string[]>([]);
  const [win, setWin] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  if (done)
    return (
      <p className="rounded-xl border bg-background p-6 text-sm" data-testid="survey-done">
        Thanks — that tells us what to send you, and what to build next.
      </p>
    );

  const pill = (active: boolean) =>
    cn(
      "rounded-md border px-3 py-1.5 text-left text-sm transition-colors",
      active ? "border-foreground bg-foreground text-background" : "hover:bg-muted",
    );

  return (
    <form
      className="space-y-6 rounded-xl border bg-background p-6"
      data-testid="lead-survey"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        try {
          await api("/api/leads/survey", {
            method: "POST",
            json: { token, stage, challenge, tools, win },
          });
          setDone(true);
        } catch {
          // api() already showed the error
        } finally {
          setBusy(false);
        }
      }}
    >
      <div>
        <p className="font-medium">Four quick questions</p>
        <p className="text-sm text-muted-foreground">So we only send what&rsquo;s useful.</p>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">{FUNNEL_SURVEY.stage.question}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {FUNNEL_SURVEY.stage.options.map((o) => (
            <button key={o} type="button" className={pill(stage === o)} onClick={() => setStage(o)}>
              {o}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">{FUNNEL_SURVEY.challenge.question}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {FUNNEL_SURVEY.challenge.options.map((o) => (
            <button
              key={o}
              type="button"
              className={pill(challenge === o)}
              onClick={() => setChallenge(o)}
            >
              {o}
            </button>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-sm font-medium">{FUNNEL_SURVEY.tools.question}</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {FUNNEL_SURVEY.tools.options.map((o) => (
            <button
              key={o}
              type="button"
              className={pill(tools.includes(o))}
              onClick={() =>
                setTools((t) => (t.includes(o) ? t.filter((x) => x !== o) : [...t, o]))
              }
            >
              {o}
            </button>
          ))}
        </div>
      </fieldset>
      <div>
        <label htmlFor="survey-win" className="text-sm font-medium">
          {FUNNEL_SURVEY.win.question}
        </label>
        <textarea
          id="survey-win"
          className="mt-2 w-full rounded-md border bg-background p-2 text-sm"
          rows={3}
          maxLength={1000}
          value={win}
          onChange={(e) => setWin(e.target.value)}
        />
      </div>
      <Button type="submit" disabled={busy || (!stage && !challenge)}>
        {busy ? <Loader2 className="animate-spin" /> : null} Send
      </Button>
    </form>
  );
}
