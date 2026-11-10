/**
 * Built-in analytics for generated apps (template data/analytics.ts → App Cloud /events). The
 * owner turns it on per app; events carry a random install id, never names, emails or
 * advertising ids. It's free: no credits, a daily limit per app, kept for 90 days.
 */
import { and, eq, lt, sql } from "drizzle-orm";
import { schema, type Database } from "@appbuilder/db";
import { AppCloudError } from "./app-cloud";

export const ANALYTICS = {
  eventsPerAppPerDay: 50_000,
  eventsPerRequest: 50,
  /** Requests per install per minute (an app batches events every few seconds). */
  requestsPerInstallPerMinute: 30,
  retentionDays: 90,
  bodyBytes: 64 * 1024,
  propsPerEvent: 10,
  propChars: 100,
} as const;

/** Events the template sends by itself; everything else is the app's own track() calls. */
export const SYSTEM_EVENTS = [
  "app_open",
  "screen_view",
  "onboarding_complete",
  "purchase",
  "restore",
] as const;

export const PAYWALL_SCREEN = "/paywall";

const NAME = /^[a-z][a-z0-9_]{0,39}$/;
const INSTALL = /^[A-Za-z0-9_-]{8,64}$/;
const PLATFORMS = new Set(["ios", "android", "web"]);

export interface AppEventInput {
  name: string;
  screen: string | null;
  props: Record<string, string | number | boolean> | null;
  test: boolean;
  at: Date;
}

export interface EventBatch {
  install: string;
  platform: string;
  events: AppEventInput[];
  /** Events left out because they were malformed. */
  dropped: number;
}

function cleanProps(value: unknown): Record<string, string | number | boolean> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    if (Object.keys(out).length >= ANALYTICS.propsPerEvent) break;
    if (!NAME.test(key)) continue;
    if (typeof v === "string") out[key] = v.slice(0, ANALYTICS.propChars);
    else if (typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v))) out[key] = v;
  }
  return Object.keys(out).length > 0 ? out : null;
}

/** Validate a batch from an app. Malformed events are dropped, a malformed batch is refused. */
export function parseEventBatch(body: unknown, now = new Date()): EventBatch {
  const input = (body ?? {}) as {
    install?: unknown;
    platform?: unknown;
    test?: unknown;
    events?: unknown;
  };
  const install = String(input.install ?? "");
  if (!INSTALL.test(install)) throw new AppCloudError(400, "Missing install id.");
  if (!Array.isArray(input.events) || input.events.length === 0)
    throw new AppCloudError(400, "No events.");
  if (input.events.length > ANALYTICS.eventsPerRequest)
    throw new AppCloudError(413, `At most ${ANALYTICS.eventsPerRequest} events per request.`);
  const platform = PLATFORMS.has(String(input.platform)) ? String(input.platform) : "web";
  const batchTest = input.test === true;
  const earliest = now.getTime() - 7 * 86_400_000;
  const latest = now.getTime() + 5 * 60_000;
  const events: AppEventInput[] = [];
  for (const raw of input.events as unknown[]) {
    const e = (raw ?? {}) as Record<string, unknown>;
    const name = String(e.name ?? "");
    if (!NAME.test(name)) continue;
    const screen = typeof e.screen === "string" && e.screen ? e.screen.slice(0, 120) : null;
    if (name === "screen_view" && !screen) continue;
    const time = Date.parse(String(e.at ?? ""));
    const at = Number.isFinite(time) && time >= earliest && time <= latest ? new Date(time) : now;
    events.push({
      name,
      screen,
      props: cleanProps(e.props),
      test: batchTest || e.test === true,
      at,
    });
  }
  return { install, platform, events, dropped: input.events.length - events.length };
}

const today = () => new Date().toISOString().slice(0, 10);

/** Store a batch, within the app's daily limit. */
export async function recordEvents(
  db: Database,
  projectId: string,
  batch: EventBatch,
): Promise<{ accepted: number }> {
  const n = batch.events.length;
  if (n === 0) return { accepted: 0 };
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(schema.appAnalyticsDay)
      .values({ projectId, day: today(), events: n })
      .onConflictDoUpdate({
        target: [schema.appAnalyticsDay.projectId, schema.appAnalyticsDay.day],
        set: { events: sql`${schema.appAnalyticsDay.events} + ${n}` },
      })
      .returning({ events: schema.appAnalyticsDay.events, day: schema.appAnalyticsDay.day });
    const before = row!.events - n;
    const allowed = Math.max(0, Math.min(n, ANALYTICS.eventsPerAppPerDay - before));
    if (allowed < n) {
      await tx
        .update(schema.appAnalyticsDay)
        .set({ events: before + allowed })
        .where(
          and(
            eq(schema.appAnalyticsDay.projectId, projectId),
            eq(schema.appAnalyticsDay.day, row!.day),
          ),
        );
    }
    if (allowed === 0) throw new AppCloudError(429, "This app reached today's analytics limit.");
    await tx.insert(schema.appEvent).values(
      batch.events.slice(0, allowed).map((e) => ({
        projectId,
        install: batch.install,
        name: e.name,
        screen: e.screen,
        props: e.props,
        platform: batch.platform,
        test: e.test,
        at: e.at,
      })),
    );
    return { accepted: allowed };
  });
}

export interface AnalyticsSummary {
  days: number;
  users: number;
  newUsers: number;
  /** One entry per UTC day, oldest first. */
  daily: Array<{ day: string; users: number; newUsers: number }>;
  /** Share of new users who came back the next day / seven days later (null: too early). */
  retention: {
    d1: { rate: number | null; cohort: number };
    d7: { rate: number | null; cohort: number };
  };
  /** People who reached each step in the period. */
  funnel: Array<{ step: "opened" | "onboarded" | "paywall" | "purchased"; users: number }>;
  screens: Array<{ screen: string; views: number; users: number }>;
  /** The app's own track() events. */
  events: Array<{ name: string; count: number; users: number }>;
  platforms: Array<{ platform: string; users: number }>;
  /** Test events (preview, Expo Go, simulated purchases) in the last 24 hours: proof it works. */
  test: { last24h: number; lastAt: string | null };
}

type Rows<T> = { rows: T[] };
const n = (v: unknown) => Number(v ?? 0);

/** What the owner sees in the Analytics tab: real (non-test) usage over the last `days`. */
export async function analyticsSummary(
  db: Database,
  projectId: string,
  days = 30,
): Promise<AnalyticsSummary> {
  const since = sql`date_trunc('day', now() at time zone 'utc') - make_interval(days => ${days - 1})`;
  const real = sql`project_id = ${projectId} and not test`;
  const inPeriod = sql`${real} and (at at time zone 'utc') >= ${since}`;
  const firstSeen = sql`
    select install, min(date_trunc('day', at at time zone 'utc')) as first_day
    from app_event where ${real} group by install`;

  const [daily, totals, retention, funnel, screens, events, platforms, test] = await Promise.all([
    db.execute(sql`
      with days as (
        select generate_series(${since}, date_trunc('day', now() at time zone 'utc'), interval '1 day') as day
      ),
      active as (
        select date_trunc('day', at at time zone 'utc') as day, count(distinct install) as users
        from app_event where ${inPeriod} group by 1
      ),
      fresh as (
        select first_day as day, count(*) as new_users from (${firstSeen}) f group by 1
      )
      select to_char(days.day, 'YYYY-MM-DD') as day,
        coalesce(active.users, 0) as users, coalesce(fresh.new_users, 0) as new_users
      from days left join active on active.day = days.day left join fresh on fresh.day = days.day
      order by days.day`) as Promise<Rows<{ day: string; users: unknown; new_users: unknown }>>,
    db.execute(sql`
      select
        (select count(distinct install) from app_event where ${inPeriod}) as users,
        (select count(*) from (${firstSeen}) f where first_day >= ${since}) as new_users`) as Promise<
      Rows<{ users: unknown; new_users: unknown }>
    >,
    db.execute(sql`
      with cohort as (select * from (${firstSeen}) f where first_day >= ${since}),
      seen as (
        select distinct install, date_trunc('day', at at time zone 'utc') as day
        from app_event where ${real}
      ),
      today as (select date_trunc('day', now() at time zone 'utc') as day)
      select
        (select count(*) from cohort, today where cohort.first_day <= today.day - interval '1 day') as d1_cohort,
        (select count(*) from cohort, today where cohort.first_day <= today.day - interval '1 day'
           and exists (select 1 from seen where seen.install = cohort.install
                       and seen.day = cohort.first_day + interval '1 day')) as d1_back,
        (select count(*) from cohort, today where cohort.first_day <= today.day - interval '7 days') as d7_cohort,
        (select count(*) from cohort, today where cohort.first_day <= today.day - interval '7 days'
           and exists (select 1 from seen where seen.install = cohort.install
                       and seen.day = cohort.first_day + interval '7 days')) as d7_back`) as Promise<
      Rows<Record<"d1_cohort" | "d1_back" | "d7_cohort" | "d7_back", unknown>>
    >,
    db.execute(sql`
      select
        count(distinct install) filter (where name = 'app_open') as opened,
        count(distinct install) filter (where name = 'onboarding_complete') as onboarded,
        count(distinct install) filter (where name = 'screen_view' and screen = ${PAYWALL_SCREEN}) as paywall,
        count(distinct install) filter (where name = 'purchase') as purchased
      from app_event where ${inPeriod}`) as Promise<
      Rows<Record<"opened" | "onboarded" | "paywall" | "purchased", unknown>>
    >,
    db.execute(sql`
      select screen, count(*) as views, count(distinct install) as users
      from app_event where ${inPeriod} and name = 'screen_view'
      group by screen order by views desc limit 8`) as Promise<
      Rows<{ screen: string; views: unknown; users: unknown }>
    >,
    db.execute(sql`
      select name, count(*) as count, count(distinct install) as users
      from app_event where ${inPeriod}
        and name not in (${sql.join(
          SYSTEM_EVENTS.map((e) => sql`${e}`),
          sql`, `,
        )})
      group by name order by count desc limit 10`) as Promise<
      Rows<{ name: string; count: unknown; users: unknown }>
    >,
    db.execute(sql`
      select platform, count(distinct install) as users
      from app_event where ${inPeriod} group by platform order by users desc`) as Promise<
      Rows<{ platform: string; users: unknown }>
    >,
    db.execute(sql`
      select count(*) as events, max(received_at) as last_at
      from app_event where project_id = ${projectId} and test
        and received_at > now() - interval '24 hours'`) as Promise<
      Rows<{ events: unknown; last_at: Date | string | null }>
    >,
  ]);

  const r = retention.rows[0]!;
  const rate = (back: unknown, cohort: unknown) =>
    n(cohort) > 0 ? Math.round((n(back) / n(cohort)) * 1000) / 1000 : null;
  const f = funnel.rows[0]!;
  const lastAt = test.rows[0]?.last_at;
  return {
    days,
    users: n(totals.rows[0]?.users),
    newUsers: n(totals.rows[0]?.new_users),
    daily: daily.rows.map((d) => ({ day: d.day, users: n(d.users), newUsers: n(d.new_users) })),
    retention: {
      d1: { rate: rate(r.d1_back, r.d1_cohort), cohort: n(r.d1_cohort) },
      d7: { rate: rate(r.d7_back, r.d7_cohort), cohort: n(r.d7_cohort) },
    },
    funnel: [
      { step: "opened", users: n(f.opened) },
      { step: "onboarded", users: n(f.onboarded) },
      { step: "paywall", users: n(f.paywall) },
      { step: "purchased", users: n(f.purchased) },
    ],
    screens: screens.rows.map((s) => ({ screen: s.screen, views: n(s.views), users: n(s.users) })),
    events: events.rows.map((e) => ({ name: e.name, count: n(e.count), users: n(e.users) })),
    platforms: platforms.rows.map((p) => ({ platform: p.platform, users: n(p.users) })),
    test: {
      last24h: n(test.rows[0]?.events),
      lastAt: lastAt ? new Date(lastAt).toISOString() : null,
    },
  };
}

/** Delete events past the retention window (run hourly by the worker). */
export async function pruneAnalytics(db: Database): Promise<number> {
  const cutoff = new Date(Date.now() - ANALYTICS.retentionDays * 86_400_000);
  const deleted = await db
    .delete(schema.appEvent)
    .where(lt(schema.appEvent.receivedAt, cutoff))
    .returning({ id: schema.appEvent.id });
  await db
    .delete(schema.appAnalyticsDay)
    .where(lt(schema.appAnalyticsDay.day, cutoff.toISOString().slice(0, 10)));
  return deleted.length;
}
