/**
 * The funnel: the App Store readiness check (/check) records a lead, sends the results email,
 * and — only for people who asked for them — a short sequence of launch emails, sent by the
 * worker. The two offer emails go out only while a real Stripe promotion code is configured
 * (FUNNEL_PROMO_CODE, FUNNEL_PROMO_OFFER, FUNNEL_PROMO_ENDS), and they state its real end date.
 */
import { randomBytes } from "node:crypto";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";
import {
  FUNNEL_SURVEY,
  scoreStoreCheck,
  STORE_CHECKS,
  type StoreCheckAnswer,
  type StoreCheckItem,
} from "@appbuilder/contract";
import { schema, type Database } from "@appbuilder/db";
import { newId } from "./ids";

export type Lead = typeof schema.lead.$inferSelect;

export class FunnelError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const DAY = 86_400_000;
/** When each launch email goes out, in days after the check (email 1 is the results, at once). */
const SCHEDULE: Record<number, number> = { 2: 1, 3: 3, 4: 5, 5: 7, 6: 8 };

export interface FunnelPromo {
  code: string;
  offer: string;
  ends: Date;
}

/** The configured offer, if it's complete and still running for at least another day. */
export function funnelPromo(now = new Date()): FunnelPromo | null {
  const code = process.env.FUNNEL_PROMO_CODE || "";
  const offer = process.env.FUNNEL_PROMO_OFFER || "";
  const ends = new Date(process.env.FUNNEL_PROMO_ENDS || "");
  if (!code || !offer || Number.isNaN(ends.getTime())) return null;
  return ends.getTime() - now.getTime() > DAY ? { code, offer, ends } : null;
}

function lastStep(promo: FunnelPromo | null): number {
  return promo ? 6 : 4;
}

/** Take the check: score it and create or update the lead for this email. */
export async function recordLead(
  db: Database,
  input: {
    email: string;
    answers: Record<string, unknown>;
    nurture: boolean;
    source?: string;
  },
): Promise<{ lead: Lead; passed: number; total: number; failed: StoreCheckItem[] }> {
  const email = input.email.trim().toLowerCase();
  if (!EMAIL.test(email) || email.length > 254) throw new FunnelError(400, "Enter a valid email.");
  const answers: Record<string, StoreCheckAnswer> = {};
  for (const check of STORE_CHECKS) {
    const value = input.answers[check.id];
    if (value !== "yes" && value !== "no" && value !== "unsure")
      throw new FunnelError(400, "Answer every question.");
    answers[check.id] = value;
  }
  const { passed, total, failed } = scoreStoreCheck(answers);
  const now = new Date();
  const [lead] = await db
    .insert(schema.lead)
    .values({
      id: newId("lead"),
      email,
      token: randomBytes(24).toString("base64url"),
      source: input.source ?? "check",
      answers,
      passed,
      total,
      nurture: input.nurture,
      nextEmailAt: input.nurture ? new Date(now.getTime() + SCHEDULE[2]! * DAY) : null,
    })
    .onConflictDoUpdate({
      target: schema.lead.email,
      set: {
        answers,
        passed,
        total,
        // Taking the check again can turn the emails on, never silently off.
        nurture: sql`${schema.lead.nurture} or ${input.nurture}`,
        unsubscribedAt: input.nurture ? null : sql`${schema.lead.unsubscribedAt}`,
        nextEmailAt: sql`case when ${input.nurture} and ${schema.lead.nextEmailAt} is null and ${schema.lead.emailsSent} < 2 then ${new Date(now.getTime() + SCHEDULE[2]! * DAY)} else ${schema.lead.nextEmailAt} end`,
        updatedAt: now,
      },
    })
    .returning();
  return { lead: lead!, passed, total, failed };
}

/** The survey after the check: only known options are kept; the open answer is trimmed. */
export async function saveLeadSurvey(
  db: Database,
  token: string,
  input: Record<string, unknown>,
): Promise<void> {
  const pick = (value: unknown, options: readonly string[]) =>
    typeof value === "string" && options.includes(value) ? value : null;
  const survey = {
    stage: pick(input.stage, FUNNEL_SURVEY.stage.options),
    challenge: pick(input.challenge, FUNNEL_SURVEY.challenge.options),
    tools: Array.isArray(input.tools)
      ? input.tools.filter((t) => pick(t, FUNNEL_SURVEY.tools.options)).slice(0, 8)
      : [],
    win: typeof input.win === "string" ? input.win.trim().slice(0, 1000) : "",
    at: new Date().toISOString(),
  };
  const updated = await db
    .update(schema.lead)
    .set({ survey, updatedAt: new Date() })
    .where(eq(schema.lead.token, token))
    .returning({ id: schema.lead.id });
  if (!updated.length) throw new FunnelError(404, "This link has expired.");
}

export async function unsubscribeLead(db: Database, token: string): Promise<boolean> {
  const updated = await db
    .update(schema.lead)
    .set({ unsubscribedAt: new Date(), nextEmailAt: null, updatedAt: new Date() })
    .where(eq(schema.lead.token, token))
    .returning({ id: schema.lead.id });
  return updated.length > 0;
}

export interface FunnelEmail {
  subject: string;
  text: string;
  headers: Record<string, string>;
}

function footer(lead: Lead, appUrl: string, marketing: boolean): string {
  const address = process.env.LEGAL_POSTAL_ADDRESS;
  return [
    "",
    "—",
    marketing
      ? "You're getting this because you took the App Store check on App Builder and asked for launch emails."
      : "You're getting this because you took the App Store check on App Builder.",
    `Unsubscribe: ${appUrl}/unsubscribe?t=${lead.token}`,
    ...(address ? [address] : []),
  ].join("\n");
}

/** Email `step` of the sequence for this lead, or null when that step doesn't apply. */
export function funnelEmail(
  step: number,
  lead: Lead,
  appUrl: string,
  promo: FunnelPromo | null = funnelPromo(),
): FunnelEmail | null {
  const unsubscribe = `${appUrl}/api/leads/unsubscribe?t=${lead.token}`;
  const headers = {
    "List-Unsubscribe": `<${unsubscribe}>`,
    "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
  };
  const start = `${appUrl}/sign-up`;
  const sign = "\n— App Builder";
  if (step === 1) {
    const failed = STORE_CHECKS.filter((c) => lead.answers[c.id] !== "yes");
    const fixes = failed.length
      ? failed
          .map((c, i) => `${i + 1}. ${c.question}\n   Fix: ${c.fix}\n   Why: ${c.why}`)
          .join("\n\n")
      : "Nothing to fix: every check passed.";
    return {
      subject: `Your App Store check: ${lead.passed} of ${lead.total} passed`,
      text: [
        `Here are your results again${failed.length ? ", with the fix for each one that didn't pass" : ""}.`,
        "",
        fixes,
        "",
        "One thing that saves the most time: make Restore Purchases easy to find — on the paywall and again in Settings — so people who reinstall get back what they paid for.",
        "",
        `So I only send what's useful: where are you with your app? (4 quick questions) ${appUrl}/check/survey?t=${lead.token}`,
        sign,
        footer(lead, appUrl, false),
      ].join("\n"),
      headers,
    };
  }
  if (step === 2)
    return {
      subject: "The expensive part isn't the checks",
      text: [
        'Fixing a few red lines takes an afternoon. The expensive part is everything around them: each fix is a prompt, each prompt can break something that worked, and each repair is another prompt. As one App Store review of another AI builder put it, "I would be spending $50 just to fix a relatively simple bug."',
        "",
        "We built App Builder so the paywall basics — price and period, trial terms, auto-renewal, Restore Purchases and a close button — are there on every build, with onboarding and settings around them. And you don't pay for the small stuff: changing text yourself and restoring an earlier version are free.",
        "",
        `Start free with 100 credits: ${start}`,
        sign,
        footer(lead, appUrl, true),
      ].join("\n"),
      headers,
    };
  if (step === 3)
    return {
      subject: "It's not you",
      text: [
        "If you've burned through credits and still don't have a store-ready app, it isn't because you're not technical enough.",
        "",
        "AI app builders bill you by the prompt for everything — even changing a word, even undoing what the AI broke — and the overage charges come after. That model makes money when things go wrong.",
        "",
        "You can build without it: change text yourself for free, roll back for free, and when your credits run out the AI simply stops. No overages.",
        "",
        start,
        sign,
        footer(lead, appUrl, true),
      ].join("\n"),
      headers,
    };
  if (step === 4)
    return {
      subject: "This week vs. in three months",
      text: [
        "This week: your idea becomes an app with onboarding, a paywall and settings, checked against App Store rules on every build — and you tweak the words yourself without paying for it.",
        "",
        "In three months: you know whether people pay. And you own the Expo source code, so the app is yours whatever you build next.",
        "",
        start,
        sign,
        footer(lead, appUrl, true),
      ].join("\n"),
      headers,
    };
  if ((step === 5 || step === 6) && promo) {
    const ends = promo.ends.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    });
    return step === 5
      ? {
          subject: `${promo.offer} — until ${ends.split(",")[0]}`,
          text: [
            `${promo.offer} with code ${promo.code} at checkout. It ends ${ends}.`,
            "",
            "Builder is $20 a month with 99 credits — about one new app plus edits — TestFlight and Google Play builds, and real in-app purchases.",
            "",
            `${appUrl}/pricing`,
            sign,
            footer(lead, appUrl, true),
          ].join("\n"),
          headers,
        }
      : {
          subject: "Last day for your code",
          text: [
            `Code ${promo.code} (${promo.offer}) ends ${ends}.`,
            "",
            `${appUrl}/pricing`,
            sign,
            footer(lead, appUrl, true),
          ].join("\n"),
          headers,
        };
  }
  return null;
}

/** After a launch email: when the next one is due, or null when the sequence is done. */
function nextAfter(lead: Lead, sent: number, promo: FunnelPromo | null): Date | null {
  const next = sent + 1;
  if (next > lastStep(promo)) return null;
  return new Date(lead.createdAt.getTime() + SCHEDULE[next]! * DAY);
}

/** Send the launch emails that are due (the worker calls this hourly when email is set up). */
export async function sendDueFunnelEmails(
  db: Database,
  input: {
    appUrl: string;
    send: (message: { to: string } & FunnelEmail) => Promise<boolean>;
    now?: Date;
    limit?: number;
  },
): Promise<number> {
  const now = input.now ?? new Date();
  const promo = funnelPromo(now);
  const due = await db
    .select()
    .from(schema.lead)
    .where(
      and(
        eq(schema.lead.nurture, true),
        isNull(schema.lead.unsubscribedAt),
        lte(schema.lead.nextEmailAt, now),
      ),
    )
    .orderBy(asc(schema.lead.nextEmailAt))
    .limit(input.limit ?? 100);
  let sent = 0;
  for (const lead of due) {
    // The results email is step 1; the sequence continues from whatever was sent last.
    let step = Math.max(2, lead.emailsSent + 1);
    let message = funnelEmail(step, lead, input.appUrl, promo);
    // Skip a step that doesn't apply (the offer emails without a promotion).
    while (!message && step < 6) message = funnelEmail(++step, lead, input.appUrl, promo);
    if (message && (await input.send({ to: lead.email, ...message }))) sent++;
    else if (message) continue; // a failed send is retried next hour
    const emailsSent = message ? step : lead.emailsSent;
    await db
      .update(schema.lead)
      .set({
        emailsSent,
        nextEmailAt: message ? nextAfter(lead, emailsSent, promo) : null,
        updatedAt: new Date(),
      })
      .where(eq(schema.lead.id, lead.id));
  }
  return sent;
}

/** Mark the results email as sent (the web app sends it right after the check). */
export async function markResultsSent(db: Database, leadId: string): Promise<void> {
  await db
    .update(schema.lead)
    .set({ emailsSent: sql`greatest(${schema.lead.emailsSent}, 1)` })
    .where(eq(schema.lead.id, leadId));
}

/** For the operator: every lead with its answers, survey and whether they signed up. */
export async function listLeads(db: Database) {
  return db
    .select({
      email: schema.lead.email,
      passed: schema.lead.passed,
      total: schema.lead.total,
      nurture: schema.lead.nurture,
      survey: schema.lead.survey,
      emailsSent: schema.lead.emailsSent,
      unsubscribed: sql<boolean>`${schema.lead.unsubscribedAt} is not null`,
      signedUp: sql<boolean>`exists (select 1 from "user" u where lower(u.email) = ${schema.lead.email})`,
      createdAt: schema.lead.createdAt,
    })
    .from(schema.lead)
    .orderBy(asc(schema.lead.createdAt));
}
