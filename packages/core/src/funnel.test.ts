import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { scoreStoreCheck, STORE_CHECKS } from "@appbuilder/contract";
import { schema, type Database } from "@appbuilder/db";
import {
  funnelEmail,
  funnelPromo,
  recordLead,
  saveLeadSurvey,
  sendDueFunnelEmails,
  unsubscribeLead,
  type FunnelEmail,
} from "./funnel";
import { testDb } from "./test-db";

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;
beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());

const all = (value: "yes" | "no" | "unsure") =>
  Object.fromEntries(STORE_CHECKS.map((c) => [c.id, value]));
const DAY = 86_400_000;
const APP = "https://app.example.com";

describe("App Store check scoring", () => {
  it("counts yes as passed and shows the fix for no and not sure", () => {
    const answers = { ...all("yes"), restore: "no", "legal-links": "unsure" } as const;
    const { passed, total, failed } = scoreStoreCheck(answers);
    expect([passed, total]).toEqual([STORE_CHECKS.length - 2, STORE_CHECKS.length]);
    expect(failed.map((f) => f.id).sort()).toEqual(["legal-links", "restore"]);
  });

  it("only sends the offer emails while a complete promotion is running", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    process.env.FUNNEL_PROMO_CODE = "LAUNCH10";
    process.env.FUNNEL_PROMO_OFFER = "$10 off your first month of Builder";
    process.env.FUNNEL_PROMO_ENDS = "2026-11-20T23:59:00Z";
    expect(funnelPromo(now)?.code).toBe("LAUNCH10");
    expect(funnelPromo(new Date("2026-11-20T12:00:00Z"))).toBeNull(); // less than a day left
    delete process.env.FUNNEL_PROMO_CODE;
    expect(funnelPromo(now)).toBeNull();
    delete process.env.FUNNEL_PROMO_OFFER;
    delete process.env.FUNNEL_PROMO_ENDS;
  });
});

describe("funnel (Postgres)", () => {
  it("records one lead per email, sends the sequence on schedule, and stops on unsubscribe", async () => {
    const email = `Lead-${Date.now()}@Example.com`;
    await expect(
      recordLead(db, { email: "nope", answers: all("yes"), nurture: true }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      recordLead(db, { email, answers: { restore: "yes" }, nurture: true }),
    ).rejects.toMatchObject({ status: 400 });

    const first = await recordLead(db, {
      email,
      answers: { ...all("yes"), restore: "no" },
      nurture: true,
    });
    expect(first.lead.email).toBe(email.toLowerCase());
    expect(first.passed).toBe(STORE_CHECKS.length - 1);
    // Taking it again updates the same lead and keeps its link.
    const again = await recordLead(db, { email, answers: all("yes"), nurture: false });
    expect(again.lead.id).toBe(first.lead.id);
    expect(again.lead.token).toBe(first.lead.token);
    expect(again.lead.nurture).toBe(true); // never silently switched off
    expect(again.passed).toBe(STORE_CHECKS.length);

    // The results email lists the fixes and carries a one-click unsubscribe.
    const results = funnelEmail(1, first.lead, APP)!;
    expect(results.subject).toBe(`Your App Store check: ${first.passed} of ${first.total} passed`);
    expect(results.text).toContain("Restore Purchases");
    expect(results.text).toContain(`${APP}/check/survey?t=${first.lead.token}`);
    expect(results.headers["List-Unsubscribe"]).toContain(first.lead.token);

    // Emails 2–4 at days 1, 3, 5; no offer emails without a promotion; then done.
    const sent: Array<{ to: string } & FunnelEmail> = [];
    const send = async (m: { to: string } & FunnelEmail) => (sent.push(m), true);
    const created = first.lead.createdAt.getTime();
    const at = (days: number) => new Date(created + days * DAY + 60_000);
    const mine = () => sent.filter((m) => m.to === email.toLowerCase()).map((m) => m.subject);
    await sendDueFunnelEmails(db, { appUrl: APP, send, now: at(0.5) });
    expect(mine()).toEqual([]);
    await sendDueFunnelEmails(db, { appUrl: APP, send, now: at(1) });
    expect(mine()).toEqual(["The expensive part isn't the checks"]);
    await sendDueFunnelEmails(db, { appUrl: APP, send, now: at(3) });
    await sendDueFunnelEmails(db, { appUrl: APP, send, now: at(5) });
    await sendDueFunnelEmails(db, { appUrl: APP, send, now: at(9) });
    expect(mine()).toEqual([
      "The expensive part isn't the checks",
      "It's not you",
      "This week vs. in three months",
    ]);
    const [done] = await db.select().from(schema.lead).where(eq(schema.lead.id, first.lead.id));
    expect(done!.emailsSent).toBe(4);
    expect(done!.nextEmailAt).toBeNull();

    // The survey keeps only known options; unsubscribing stops everything.
    await saveLeadSurvey(db, first.lead.token, {
      stage: "Building it now",
      challenge: "Getting it into the App Store",
      tools: ["Vibecode", "Made up"],
      win: "  ship it  ",
    });
    const [surveyed] = await db.select().from(schema.lead).where(eq(schema.lead.id, first.lead.id));
    expect(surveyed!.survey).toMatchObject({
      stage: "Building it now",
      challenge: "Getting it into the App Store",
      tools: ["Vibecode"],
      win: "ship it",
    });
    await expect(saveLeadSurvey(db, "wrong-token", {})).rejects.toMatchObject({ status: 404 });
    expect(await unsubscribeLead(db, first.lead.token)).toBe(true);
    const [gone] = await db.select().from(schema.lead).where(eq(schema.lead.id, first.lead.id));
    expect(gone!.unsubscribedAt).not.toBeNull();
  });

  it("adds the two offer emails, with the code's real end date, while a promotion runs", async () => {
    process.env.FUNNEL_PROMO_CODE = "LAUNCH10";
    process.env.FUNNEL_PROMO_OFFER = "$10 off your first month of Builder";
    process.env.FUNNEL_PROMO_ENDS = new Date(Date.now() + 30 * DAY).toISOString();
    const email = `offer-${Date.now()}@example.com`;
    const { lead } = await recordLead(db, { email, answers: all("yes"), nurture: true });
    const sent: string[] = [];
    const send = async (m: { to: string } & FunnelEmail) => (
      m.to === email && sent.push(m.subject + "\n" + m.text),
      true
    );
    for (const days of [1, 3, 5, 7, 8])
      await sendDueFunnelEmails(db, {
        appUrl: APP,
        send,
        now: new Date(lead.createdAt.getTime() + days * DAY + 60_000),
      });
    expect(sent).toHaveLength(5);
    expect(sent[3]).toContain("code LAUNCH10");
    expect(sent[4]).toContain("Last day for your code");
    delete process.env.FUNNEL_PROMO_CODE;
    delete process.env.FUNNEL_PROMO_OFFER;
    delete process.env.FUNNEL_PROMO_ENDS;
  });
});
