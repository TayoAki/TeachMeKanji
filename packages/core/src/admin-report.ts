/**
 * The operator's view of who uses App Builder: every account with the apps it made, the AI runs
 * behind them and what those runs cost. Read straight from the product's tables.
 *
 * A run's cost is what was recorded when it finished (agent_run.cost_usd). Runs from before that
 * was recorded are estimated from their token counts and their model's list price, which is
 * close for single-model runs and low for runs that also made images; `estimatedRuns` says how
 * many of a total's runs were estimated.
 */
import { sql, type SQL } from "drizzle-orm";
import type { Database } from "@appbuilder/db";
import {
  CREDIT_USD,
  HOSTING_USD_PER_USER_MONTH,
  MODEL_PRICES,
  PAID_PLANS,
  PAYMENT_FEE_FIXED_USD,
  PAYMENT_FEE_RATE,
  PLANS,
} from "./billing";

export interface RunTotals {
  runs: number;
  failedRuns: number;
  creditsCharged: number;
  /** Model and image spend in USD. */
  costUsd: number;
  /** Runs counted in costUsd from token counts, because no cost was recorded for them. */
  estimatedRuns: number;
  /** Runs with neither a recorded cost nor a priced model: not in costUsd. */
  unpricedRuns: number;
  tokensIn: number;
  tokensOut: number;
  lastRunAt: Date | null;
}

export interface AdminUserRow extends RunTotals {
  id: string;
  name: string;
  email: string;
  emailVerified: boolean;
  createdAt: Date;
  plan: string;
  creditBalance: number;
  apps: number;
  deletedApps: number;
  /** Collected from this account's recorded Stripe invoices, all time (USD). */
  paidUsd: number;
}

export interface AdminAppRow extends RunTotals {
  id: string;
  name: string;
  prompt: string;
  status: string;
  backend: string;
  publishedSlug: string | null;
  versions: number;
  createdAt: Date;
  deletedAt: Date | null;
}

export interface AdminRunRow {
  id: string;
  projectId: string;
  projectName: string;
  kind: string;
  status: string;
  model: string | null;
  tokensIn: number;
  tokensOut: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  creditsCharged: number;
  costUsd: number | null;
  costEstimated: boolean;
  error: string | null;
  createdAt: Date;
  seconds: number | null;
}

export interface AdminUsersReport {
  sinceDays: number | null;
  users: AdminUserRow[];
  totals: RunTotals & { users: number; apps: number };
}

export interface AdminUserDetail {
  user: AdminUserRow;
  apps: AdminAppRow[];
  byKind: Array<RunTotals & { kind: string }>;
  /** Newest first, at most `runLimit`. */
  runs: AdminRunRow[];
}

/** What a credit charge is worth at the price a credit stands for. */
export const creditsToUsd = (credits: number) => credits * CREDIT_USD;

/** MODEL_PRICES as a table the queries can join on (USD per million tokens). */
function priceTable(): SQL {
  const rows = Object.entries(MODEL_PRICES).map(
    ([model, p]) =>
      sql`(${model}::text, ${p.input}::float8, ${p.output}::float8, ${p.cacheRead}::float8, ${p.cacheWrite}::float8)`,
  );
  return sql`(values ${sql.join(rows, sql`, `)}) as price(model, input, output, cache_read, cache_write)`;
}

/** A run's cost from its tokens and its model's price; null when the model has no price. */
const ESTIMATE = sql`case when price.model is null then null else
  (r.tokens_in * price.input + r.tokens_out * price.output
   + r.cache_read_tokens * price.cache_read + r.cache_write_tokens * price.cache_write) / 1000000.0 end`;

/** The columns of RunTotals, aggregated over runs `r` left-joined to `price`. */
const TOTALS = sql`
  count(r.id)::int as runs,
  count(r.id) filter (where r.status = 'failed')::int as failed_runs,
  coalesce(sum(r.credits_charged), 0)::int as credits_charged,
  coalesce(sum(coalesce(r.cost_usd::float8, ${ESTIMATE})), 0)::float8 as cost_usd,
  count(r.id) filter (where r.cost_usd is null and price.model is not null
    and r.tokens_in + r.tokens_out > 0)::int as estimated_runs,
  count(r.id) filter (where r.cost_usd is null and price.model is null
    and r.tokens_in + r.tokens_out > 0)::int as unpriced_runs,
  coalesce(sum(r.tokens_in + r.cache_read_tokens + r.cache_write_tokens), 0)::float8 as tokens_in,
  coalesce(sum(r.tokens_out), 0)::float8 as tokens_out,
  max(r.created_at) as last_run_at`;

type Row = Record<string, unknown>;

function totals(row: Row): RunTotals {
  return {
    runs: Number(row.runs ?? 0),
    failedRuns: Number(row.failed_runs ?? 0),
    creditsCharged: Number(row.credits_charged ?? 0),
    costUsd: Number(row.cost_usd ?? 0),
    estimatedRuns: Number(row.estimated_runs ?? 0),
    unpricedRuns: Number(row.unpriced_runs ?? 0),
    tokensIn: Number(row.tokens_in ?? 0),
    tokensOut: Number(row.tokens_out ?? 0),
    lastRunAt: row.last_run_at ? new Date(row.last_run_at as string) : null,
  };
}

function userRow(row: Row): AdminUserRow {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    email: String(row.email),
    emailVerified: Boolean(row.email_verified),
    createdAt: new Date(row.created_at as string),
    plan: String(row.plan ?? "free"),
    creditBalance: Number(row.credit_balance ?? 0),
    apps: Number(row.apps ?? 0),
    deletedApps: Number(row.deleted_apps ?? 0),
    paidUsd: Number(row.paid_usd ?? 0),
    ...totals(row),
  };
}

/** Accounts with their totals; `since` limits the runs counted, never the accounts listed. */
function usersQuery(since: Date, where: SQL): SQL {
  return sql`
    select u.id, u.name, u.email, u.email_verified, u.created_at,
      coalesce((select s.plan from subscription s where s.user_id = u.id
        and s.status in ('active', 'trialing')), 'free') as plan,
      (select coalesce(sum(l.delta), 0)::int from credit_ledger l where l.user_id = u.id) as credit_balance,
      (select count(*)::int from project p where p.owner_id = u.id and p.deleted_at is null) as apps,
      (select count(*)::int from project p where p.owner_id = u.id and p.deleted_at is not null) as deleted_apps,
      (select coalesce(sum(pay.amount_cents), 0) / 100.0 from payment pay
        where pay.user_id = u.id and lower(pay.currency) = 'usd')::float8 as paid_usd,
      t.*
    from "user" u
    left join lateral (
      select ${TOTALS} from agent_run r left join ${priceTable()} on price.model = r.model
      where r.user_id = u.id and r.created_at >= ${since}
    ) t on true
    where ${where}`;
}

const sinceDate = (days: number | null) =>
  days ? new Date(Date.now() - days * 86_400_000) : new Date(0);

/**
 * Every account, most expensive first. `sinceDays` limits the runs counted (null: all time);
 * `search` matches part of an email or a name.
 */
export async function adminUsers(
  db: Database,
  options: { sinceDays?: number | null; search?: string; limit?: number } = {},
): Promise<AdminUsersReport> {
  const sinceDays = options.sinceDays ?? null;
  const search = (options.search ?? "").trim().toLowerCase();
  // Escape LIKE's own wildcards so a search for "a_b" means those three characters.
  const pattern = `%${search.replace(/[\\%_]/g, "\\$&")}%`;
  const where = search
    ? sql`(lower(u.email) like ${pattern} or lower(u.name) like ${pattern})`
    : sql`true`;
  const result = await db.execute(sql`
    ${usersQuery(sinceDate(sinceDays), where)}
    order by t.cost_usd desc, t.runs desc, u.created_at desc
    limit ${Math.min(Math.max(options.limit ?? 500, 1), 2000)}`);
  const users = (result.rows as Row[]).map(userRow);
  const sum = (pick: (u: AdminUserRow) => number) => users.reduce((n, u) => n + pick(u), 0);
  const last = users.reduce<Date | null>(
    (latest, u) => (u.lastRunAt && (!latest || u.lastRunAt > latest) ? u.lastRunAt : latest),
    null,
  );
  return {
    sinceDays,
    users,
    totals: {
      users: users.length,
      apps: sum((u) => u.apps),
      runs: sum((u) => u.runs),
      failedRuns: sum((u) => u.failedRuns),
      creditsCharged: sum((u) => u.creditsCharged),
      costUsd: sum((u) => u.costUsd),
      estimatedRuns: sum((u) => u.estimatedRuns),
      unpricedRuns: sum((u) => u.unpricedRuns),
      tokensIn: sum((u) => u.tokensIn),
      tokensOut: sum((u) => u.tokensOut),
      lastRunAt: last,
    },
  };
}

/** One account: its apps (deleted ones too), cost by kind of run, and its latest runs. */
export async function adminUser(
  db: Database,
  userId: string,
  options: { sinceDays?: number | null; runLimit?: number } = {},
): Promise<AdminUserDetail | null> {
  const since = sinceDate(options.sinceDays ?? null);
  const [row] = (await db.execute(usersQuery(since, sql`u.id = ${userId}`))).rows as Row[];
  if (!row) return null;

  // Runs are counted on the account that started them, so a collaborator's runs on someone
  // else's app show under the collaborator. Apps listed here are the ones this account owns.
  const apps = (
    await db.execute(sql`
      select p.id, p.name, p.prompt, p.status, p.backend, p.published_slug, p.created_at, p.deleted_at,
        (select count(*)::int from project_version v where v.project_id = p.id) as versions,
        t.*
      from project p
      left join lateral (
        select ${TOTALS} from agent_run r left join ${priceTable()} on price.model = r.model
        where r.project_id = p.id and r.created_at >= ${since}
      ) t on true
      where p.owner_id = ${userId}
      order by p.created_at desc`)
  ).rows as Row[];

  const byKind = (
    await db.execute(sql`
      select r.kind, ${TOTALS}
      from agent_run r left join ${priceTable()} on price.model = r.model
      where r.user_id = ${userId} and r.created_at >= ${since}
      group by r.kind order by cost_usd desc, runs desc`)
  ).rows as Row[];

  const runs = (
    await db.execute(sql`
      select r.id, r.project_id, p.name as project_name, r.kind, r.status, r.model,
        r.tokens_in, r.tokens_out, r.cache_read_tokens, r.cache_write_tokens, r.credits_charged,
        coalesce(r.cost_usd::float8, ${ESTIMATE}) as cost_usd,
        (r.cost_usd is null) as cost_estimated,
        r.error, r.created_at,
        extract(epoch from (r.finished_at - coalesce(r.started_at, r.created_at)))::float8 as seconds
      from agent_run r
      join project p on p.id = r.project_id
      left join ${priceTable()} on price.model = r.model
      where r.user_id = ${userId} and r.created_at >= ${since}
      order by r.created_at desc
      limit ${Math.min(Math.max(options.runLimit ?? 200, 1), 1000)}`)
  ).rows as Row[];

  return {
    user: userRow(row),
    apps: apps.map((a) => ({
      id: String(a.id),
      name: String(a.name),
      prompt: String(a.prompt ?? ""),
      status: String(a.status),
      backend: String(a.backend),
      publishedSlug: (a.published_slug as string | null) ?? null,
      versions: Number(a.versions ?? 0),
      createdAt: new Date(a.created_at as string),
      deletedAt: a.deleted_at ? new Date(a.deleted_at as string) : null,
      ...totals(a),
    })),
    byKind: byKind.map((k) => ({ kind: String(k.kind), ...totals(k) })),
    runs: runs.map((r) => ({
      id: String(r.id),
      projectId: String(r.project_id),
      projectName: String(r.project_name),
      kind: String(r.kind),
      status: String(r.status),
      model: (r.model as string | null) ?? null,
      tokensIn: Number(r.tokens_in ?? 0),
      tokensOut: Number(r.tokens_out ?? 0),
      cacheReadTokens: Number(r.cache_read_tokens ?? 0),
      cacheWriteTokens: Number(r.cache_write_tokens ?? 0),
      creditsCharged: Number(r.credits_charged ?? 0),
      costUsd: r.cost_usd === null || r.cost_usd === undefined ? null : Number(r.cost_usd),
      costEstimated: Boolean(r.cost_estimated),
      error: (r.error as string | null) ?? null,
      createdAt: new Date(r.created_at as string),
      seconds: r.seconds === null || r.seconds === undefined ? null : Number(r.seconds),
    })),
  };
}

export interface AdminRevenue {
  sinceDays: number | null;
  /** Collected from paid Stripe invoices in the period (USD), after discounts. */
  revenueUsd: number;
  invoices: number;
  /**
   * Invoices from before payments were recorded: counted at the plan's current list price from
   * the monthly credit grant each one made, so discounts and old prices are not reflected.
   */
  estimatedInvoices: number;
  /** Invoices in a currency other than USD: listed, not added to revenueUsd. */
  otherCurrencyInvoices: number;
  /** Paying subscribers right now, and what they pay per month at list price. */
  subscribers: Array<{ plan: string; count: number; monthlyUsd: number }>;
  mrrUsd: number;
  /** Model and image spend in the period, for every account. */
  aiCostUsd: number;
  /** Card processing on the period's invoices, estimated from the standard rates. */
  paymentFeesUsd: number;
  /** Hosting estimate: paying subscribers at the per-subscriber monthly figure, pro rata. */
  hostingUsd: number;
  profitUsd: number;
  /** Profit over revenue, or null when there is no revenue. */
  margin: number | null;
}

/** What App Builder collected and what it cost to serve, for the period (null: all time). */
export async function adminRevenue(
  db: Database,
  sinceDays: number | null = null,
): Promise<AdminRevenue> {
  const since = sinceDate(sinceDays);
  const [paid] = (
    await db.execute(sql`
      with recorded as (
        select id, amount_cents / 100.0 as usd, lower(currency) as currency from payment
        where paid_at >= ${since}
      ),
      -- Monthly credit grants keyed by an invoice that has no payment row: invoices paid before
      -- payments were recorded. The note names the plan ("Builder monthly credits").
      older as (
        select l.external_id,
          (case lower(split_part(l.note, ' ', 1)) ${sql.join(
            PAID_PLANS.map(
              (plan) => sql`when ${plan} then ${PLANS[plan].priceUsdPerMonth}::float8`,
            ),
            sql` `,
          )} else 0 end) as usd
        from credit_ledger l
        where l.reason = 'monthly' and l.external_id like 'invoice:%' and l.created_at >= ${since}
          and not exists (select 1 from payment p where 'invoice:' || p.id = l.external_id)
      )
      select
        (select coalesce(sum(usd), 0)::float8 from recorded where currency = 'usd') as recorded_usd,
        (select count(*)::int from recorded where currency = 'usd') as recorded_count,
        (select count(*)::int from recorded where currency <> 'usd') as other_currency,
        (select coalesce(sum(usd), 0)::float8 from older) as older_usd,
        (select count(*)::int from older) as older_count`)
  ).rows as Row[];

  const subscribers = (
    (
      await db.execute(sql`
        select s.plan, count(*)::int as count, (count(*) * (case s.plan ${sql.join(
          PAID_PLANS.map((plan) => sql`when ${plan} then ${PLANS[plan].priceUsdPerMonth}::float8`),
          sql` `,
        )} else 0 end))::float8 as monthly_usd
        from subscription s
        where s.plan <> 'free' and s.status in ('active', 'trialing')
        group by s.plan order by monthly_usd desc`)
    ).rows as Row[]
  ).map((r) => ({
    plan: String(r.plan),
    count: Number(r.count),
    monthlyUsd: Number(r.monthly_usd),
  }));

  const [cost] = (
    await db.execute(sql`
      select coalesce(sum(coalesce(r.cost_usd::float8, ${ESTIMATE})), 0)::float8 as cost_usd
      from agent_run r left join ${priceTable()} on price.model = r.model
      where r.created_at >= ${since}`)
  ).rows as Row[];

  const revenueUsd = Number(paid?.recorded_usd ?? 0) + Number(paid?.older_usd ?? 0);
  const invoices = Number(paid?.recorded_count ?? 0) + Number(paid?.older_count ?? 0);
  const paymentFeesUsd = revenueUsd * PAYMENT_FEE_RATE + invoices * PAYMENT_FEE_FIXED_USD;
  const paying = subscribers.reduce((n, s) => n + s.count, 0);
  // Hosting is a monthly figure per paying subscriber; all time has no length, so it is left out.
  const hostingUsd = sinceDays ? paying * HOSTING_USD_PER_USER_MONTH * (sinceDays / 30) : 0;
  const aiCostUsd = Number(cost?.cost_usd ?? 0);
  const profitUsd = revenueUsd - aiCostUsd - paymentFeesUsd - hostingUsd;
  return {
    sinceDays,
    revenueUsd,
    invoices,
    estimatedInvoices: Number(paid?.older_count ?? 0),
    otherCurrencyInvoices: Number(paid?.other_currency ?? 0),
    subscribers,
    mrrUsd: subscribers.reduce((n, s) => n + s.monthlyUsd, 0),
    aiCostUsd,
    paymentFeesUsd,
    hostingUsd,
    profitUsd,
    margin: revenueUsd > 0 ? profitUsd / revenueUsd : null,
  };
}
