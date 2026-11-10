import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { schema, type Database } from "@appbuilder/db";
import {
  ANALYTICS,
  analyticsSummary,
  parseEventBatch,
  recordEvents,
  type AppEventInput,
} from "./app-analytics";
import { createProject } from "./projects";
import { makeUser, testDb } from "./test-db";

let handle: Awaited<ReturnType<typeof testDb>>;
let db: Database;
beforeAll(async () => {
  handle = await testDb();
  if (handle) db = handle.db;
});
afterAll(async () => handle?.close());

const now = new Date("2026-11-10T12:00:00Z");

describe("analytics event batches", () => {
  it("keeps well-formed events, drops the rest and clamps times", () => {
    const batch = parseEventBatch(
      {
        install: "abc123def456",
        platform: "ios",
        test: false,
        events: [
          { name: "app_open", at: "2026-11-10T11:59:00Z" },
          { name: "screen_view", screen: "/paywall", at: "2026-11-10T11:59:01Z" },
          { name: "screen_view", at: "2026-11-10T11:59:02Z" }, // no screen
          { name: "Bad Name!", at: "2026-11-10T11:59:03Z" },
          { name: "lesson_completed", props: { level: "N5", x: { nested: 1 }, "Bad key": 1 } },
          { name: "purchase", test: true, at: "2020-01-01T00:00:00Z" }, // far past: now
        ],
      },
      now,
    );
    expect(batch.install).toBe("abc123def456");
    expect(batch.platform).toBe("ios");
    expect(batch.dropped).toBe(2);
    expect(batch.events.map((e) => e.name)).toEqual([
      "app_open",
      "screen_view",
      "lesson_completed",
      "purchase",
    ]);
    expect(batch.events[2]!.props).toEqual({ level: "N5" });
    expect(batch.events[3]).toMatchObject({ test: true, at: now });
  });

  it("refuses batches without an install id, empty or too large", () => {
    expect(() => parseEventBatch({ install: "x", events: [{ name: "a" }] })).toThrow(/install/);
    expect(() => parseEventBatch({ install: "abc123def456", events: [] })).toThrow(/No events/);
    const many = Array.from({ length: ANALYTICS.eventsPerRequest + 1 }, () => ({ name: "a" }));
    expect(() => parseEventBatch({ install: "abc123def456", events: many })).toThrow(/At most/);
  });
});

describe("analytics (Postgres)", () => {
  const ago = (days: number, minutes = 0) =>
    new Date(Date.now() - days * 86_400_000 - minutes * 60_000);
  const ev = (name: string, at: Date, extra: Partial<AppEventInput> = {}): AppEventInput => ({
    name,
    screen: null,
    props: null,
    test: false,
    at,
    ...extra,
  });

  it("counts users, retention and the money funnel from real events only", async () => {
    const owner = await makeUser(db);
    const p = await createProject(db, { ownerId: owner.id, prompt: "x", platforms: "both" });
    const send = (install: string, events: AppEventInput[], platform = "ios") =>
      recordEvents(db, p.id, { install, platform, events, dropped: 0 });

    // A: new 3 days ago, came back the next day, onboarded, saw the paywall, bought for real.
    await send("install-aaaa", [
      ev("app_open", ago(3)),
      ev("onboarding_complete", ago(3)),
      ev("screen_view", ago(3), { screen: "/paywall" }),
      ev("purchase", ago(3), { props: { offer: "yearly" } }),
      ev("app_open", ago(2)),
      ev("lesson_completed", ago(2)),
      ev("lesson_completed", ago(2)),
    ]);
    // B: new 3 days ago, never came back; its purchase was simulated (a test).
    await send(
      "install-bbbb",
      [
        ev("app_open", ago(3)),
        ev("onboarding_complete", ago(3)),
        ev("purchase", ago(3), { test: true }),
      ],
      "android",
    );
    // C: new today.
    await send("install-cccc", [
      ev("app_open", ago(0)),
      ev("screen_view", ago(0), { screen: "/" }),
    ]);
    // T: the preview.
    await send("install-tttt", [ev("app_open", ago(0), { test: true })], "web");

    const s = await analyticsSummary(db, p.id);
    expect(s.users).toBe(3);
    expect(s.newUsers).toBe(3);
    expect(s.daily).toHaveLength(30);
    expect(s.daily.at(-1)).toMatchObject({ users: 1, newUsers: 1 });
    expect(s.daily.at(-4)).toMatchObject({ users: 2, newUsers: 2 });
    expect(s.retention.d1).toEqual({ rate: 0.5, cohort: 2 });
    expect(s.retention.d7).toEqual({ rate: null, cohort: 0 });
    expect(s.funnel).toEqual([
      { step: "opened", users: 3 },
      { step: "onboarded", users: 2 },
      { step: "paywall", users: 1 },
      { step: "purchased", users: 1 },
    ]);
    expect(s.events).toEqual([{ name: "lesson_completed", count: 2, users: 1 }]);
    expect(s.screens[0]).toMatchObject({ views: 1, users: 1 });
    expect(s.platforms).toEqual(
      expect.arrayContaining([
        { platform: "ios", users: 2 },
        { platform: "android", users: 1 },
      ]),
    );
    expect(s.test.last24h).toBe(2);
    expect(s.test.lastAt).not.toBeNull();
  });

  it("stops at the daily limit per app", async () => {
    const owner = await makeUser(db);
    const p = await createProject(db, { ownerId: owner.id, prompt: "x", platforms: "both" });
    await db.insert(schema.appAnalyticsDay).values({
      projectId: p.id,
      day: new Date().toISOString().slice(0, 10),
      events: ANALYTICS.eventsPerAppPerDay - 1,
    });
    const batch = {
      install: "install-dddd",
      platform: "ios",
      events: [ev("app_open", ago(0)), ev("app_open", ago(0)), ev("app_open", ago(0))],
      dropped: 0,
    };
    expect(await recordEvents(db, p.id, batch)).toEqual({ accepted: 1 });
    await expect(recordEvents(db, p.id, batch)).rejects.toMatchObject({ status: 429 });
    expect((await analyticsSummary(db, p.id)).funnel[0]).toEqual({ step: "opened", users: 1 });
  });
});
