/**
 * The operator's view of App Builder's own funnel: of the people who signed up in a period,
 * how many reached each step from verifying their email to paying. Read straight from the
 * product's tables, so there's no tracking script on the site. The operator's own accounts
 * (ADMIN_EMAILS) are left out.
 */
import { sql } from "drizzle-orm";
import type { Database } from "@appbuilder/db";

export interface FunnelStep {
  key: string;
  label: string;
  users: number;
}

export interface FunnelReport {
  sinceDays: number | null;
  steps: FunnelStep[];
  /** Sign-ups per day (UTC), oldest first. */
  daily: Array<{ day: string; signups: number }>;
  /** The App Store check: people who took it, and how many of them have an account. */
  leads: { total: number; signedUp: number };
  /** Median hours from sign-up to the first successful build, among those who built. */
  medianHoursToFirstBuild: number | null;
  /** People who used the AI on at least two different days. */
  returning: number;
}

function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export async function funnelReport(
  db: Database,
  sinceDays: number | null = 30,
  /** An exact window instead (sign-ups from `from` up to `to`). */
  range?: { from: Date; to: Date },
): Promise<FunnelReport> {
  const since =
    range?.from ?? (sinceDays ? new Date(Date.now() - sinceDays * 86_400_000) : new Date(0));
  const until = range?.to ?? new Date(Date.now() + 60_000);
  const admins = adminEmails();
  // The period's sign-ups, without the operator's own accounts.
  const cohort = sql`select id, email, email_verified, created_at from "user"
    where created_at >= ${since} and created_at < ${until}
    ${
      admins.length
        ? sql`and lower(email) not in (${sql.join(
            admins.map((a) => sql`${a}`),
            sql`, `,
          )})`
        : sql``
    }`;
  const ranBy = (kind: string) => sql`(select count(distinct r.user_id)::int from agent_run r
    join cohort c on c.id = r.user_id where r.kind = ${kind} and r.status = 'succeeded')`;

  const [counts] = (
    await db.execute(sql`
      with cohort as (${cohort})
      select
        (select count(*)::int from cohort) as signed_up,
        (select count(*)::int from cohort where email_verified) as verified,
        (select count(distinct p.owner_id)::int from project p join cohort c on c.id = p.owner_id) as created_project,
        ${ranBy("plan")} as planned,
        ${ranBy("build")} as built,
        ${ranBy("edit")} as edited,
        (select count(distinct p.owner_id)::int from device_session d
          join project p on p.id = d.project_id join cohort c on c.id = p.owner_id) as phone,
        (select count(distinct c.id)::int from cohort c where
          exists (select 1 from project p where p.owner_id = c.id and p.published_slug is not null)
          or exists (select 1 from agent_run r where r.user_id = c.id and r.status = 'succeeded'
            and r.kind in ('native_build', 'github_push', 'store_listing', 'promo_render'))) as shipped,
        (select count(distinct s.user_id)::int from subscription s join cohort c on c.id = s.user_id
          where s.plan <> 'free' and s.status = 'active') as paid,
        (select count(*)::int from (select r.user_id from agent_run r join cohort c on c.id = r.user_id
          group by r.user_id having count(distinct date_trunc('day', r.created_at)) >= 2) t) as returning,
        (select percentile_cont(0.5) within group (order by extract(epoch from first_build - c.created_at) / 3600)
          from cohort c join (select user_id, min(finished_at) as first_build from agent_run
            where kind = 'build' and status = 'succeeded' group by user_id) b on b.user_id = c.id) as median_hours
    `)
  ).rows as Array<Record<string, number | null>>;

  const daily = (
    await db.execute(sql`
      with cohort as (${cohort})
      select to_char(date_trunc('day', created_at at time zone 'UTC'), 'YYYY-MM-DD') as day, count(*)::int as signups
      from cohort group by 1 order by 1
    `)
  ).rows as Array<{ day: string; signups: number }>;

  const [leads] = (
    await db.execute(sql`
      select count(*)::int as total,
        count(*) filter (where exists (select 1 from "user" u where lower(u.email) = lead.email))::int as signed_up
      from lead where created_at >= ${since} and created_at < ${until}
    `)
  ).rows as Array<{ total: number; signed_up: number }>;

  const c = counts ?? {};
  const n = (key: string) => Number(c[key] ?? 0);
  return {
    sinceDays,
    steps: [
      { key: "signed_up", label: "Signed up", users: n("signed_up") },
      { key: "verified", label: "Verified their email", users: n("verified") },
      { key: "created_project", label: "Started a project", users: n("created_project") },
      { key: "planned", label: "Got a plan", users: n("planned") },
      { key: "built", label: "Built an app", users: n("built") },
      { key: "edited", label: "Edited it", users: n("edited") },
      { key: "phone", label: "Opened it on a phone", users: n("phone") },
      {
        key: "shipped",
        label: "Shipped something (published, exported to GitHub, store build, listing or video)",
        users: n("shipped"),
      },
      { key: "paid", label: "Pays for a plan", users: n("paid") },
    ],
    daily,
    leads: { total: Number(leads?.total ?? 0), signedUp: Number(leads?.signed_up ?? 0) },
    medianHoursToFirstBuild:
      c.median_hours === null || c.median_hours === undefined
        ? null
        : Math.round(Number(c.median_hours) * 10) / 10,
    returning: n("returning"),
  };
}
