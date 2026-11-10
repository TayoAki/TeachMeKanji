"use client";

import { useEffect, useState } from "react";
import { BarChart3, FlaskConical, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { TimeAgo } from "@/components/time-ago";

interface Summary {
  days: number;
  users: number;
  newUsers: number;
  daily: Array<{ day: string; users: number; newUsers: number }>;
  retention: {
    d1: { rate: number | null; cohort: number };
    d7: { rate: number | null; cohort: number };
  };
  funnel: Array<{ step: "opened" | "onboarded" | "paywall" | "purchased"; users: number }>;
  screens: Array<{ screen: string; views: number; users: number }>;
  events: Array<{ name: string; count: number; users: number }>;
  platforms: Array<{ platform: string; users: number }>;
  test: { last24h: number; lastAt: string | null };
}

const STEP_LABEL: Record<Summary["funnel"][number]["step"], string> = {
  opened: "Opened the app",
  onboarded: "Finished onboarding",
  paywall: "Saw the paywall",
  purchased: "Started a trial or subscribed",
};

const PLATFORM_LABEL: Record<string, string> = { ios: "iPhone", android: "Android", web: "Web" };

/** One series, one hue (validated against both surfaces: blue 450 light, 400 dark). */
const BAR = "bg-[#2a78d6] dark:bg-[#3987e5]";

const fmt = (n: number) =>
  n >= 10_000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}K` : n.toLocaleString("en-US");
const pct = (rate: number | null) => (rate === null ? "—" : `${Math.round(rate * 100)}%`);
const dayLabel = (day: string) =>
  new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });

/** The Analytics tab: the switch, then users, retention and the money funnel. */
export function AnalyticsView({
  projectId,
  canManage,
  hasVersion,
  refreshKey,
  onChanged,
}: {
  projectId: string;
  canManage: boolean;
  hasVersion: boolean;
  refreshKey: unknown;
  onChanged: () => void;
}) {
  const [data, setData] = useState<{ enabled: boolean; summary: Summary } | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    api<{ enabled: boolean; summary: Summary }>(`/api/projects/${projectId}/analytics`, {
      quiet: true,
    })
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId, refreshKey, tick]);

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/analytics`, { method: "POST", json: { enabled } });
      toast.success(enabled ? "Analytics is on" : "Analytics is off");
      setTick((t) => t + 1);
      onChanged();
    } catch {
      // api() already showed the error
    } finally {
      setBusy(false);
    }
  };

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading analytics…</div>;
  const { enabled, summary } = data;

  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6" data-testid="analytics-view">
      <section className="rounded-xl border bg-background p-4">
        <div className="flex items-start gap-3">
          <BarChart3 className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h2 className="font-semibold">Analytics</h2>
              <span className="text-xs text-muted-foreground">Free · no credits</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              How many people use your app, how many come back, and where they drop off between
              onboarding, the paywall and buying. Counted automatically; ask in the chat to count
              anything else (&ldquo;track when someone finishes a lesson&rdquo;).
            </p>
          </div>
          <div className="flex items-center gap-2">
            {busy ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
            <Switch
              checked={enabled}
              disabled={!canManage || busy || !hasVersion}
              onCheckedChange={toggle}
              aria-label="Analytics"
              data-testid="analytics-switch"
            />
          </div>
        </div>
        <p className="mt-3 flex gap-2 rounded-lg bg-muted/60 p-3 text-xs text-muted-foreground">
          <ShieldCheck className="size-4 shrink-0" />
          <span>
            Events carry a random install id, never names, emails or advertising ids, so there is no
            tracking prompt. When it&rsquo;s on, declare{" "}
            <strong>Usage data · Product interaction, used for analytics</strong> in App Store
            Connect&rsquo;s App Privacy and Google Play&rsquo;s Data safety form. Data is kept for
            90 days.
          </span>
        </p>
        {!hasVersion ? (
          <p className="mt-2 text-xs text-muted-foreground">Build the app first.</p>
        ) : null}
      </section>

      {enabled ? (
        <>
          <p
            className="flex items-center gap-2 text-xs text-muted-foreground"
            data-testid="analytics-test-events"
          >
            <FlaskConical className="size-4" />
            {summary.test.last24h > 0 ? (
              <span>
                {fmt(summary.test.last24h)} test events in the last 24 hours (the preview, Expo Go
                and simulated purchases), last <TimeAgo date={summary.test.lastAt!} />. They show
                tracking works and aren&rsquo;t counted below.
              </span>
            ) : (
              <span>
                No test events yet. Use the app in the preview and they&rsquo;ll show up here within
                a few seconds (not counted below).
              </span>
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label={`Users · last ${summary.days} days`} value={fmt(summary.users)} />
            <Stat label="New users" value={fmt(summary.newUsers)} />
            <Stat
              label="Came back the next day"
              value={pct(summary.retention.d1.rate)}
              note={
                summary.retention.d1.cohort > 0
                  ? `of ${fmt(summary.retention.d1.cohort)} new users`
                  : "Not enough days yet"
              }
            />
            <Stat
              label="Came back after 7 days"
              value={pct(summary.retention.d7.rate)}
              note={
                summary.retention.d7.cohort > 0
                  ? `of ${fmt(summary.retention.d7.cohort)} new users`
                  : "Not enough days yet"
              }
            />
          </div>

          {summary.users === 0 ? (
            <p className="rounded-xl border border-dashed p-6 text-center text-sm text-muted-foreground">
              No real users yet. Numbers appear when people use a TestFlight, Play testing or store
              build of this version or later.
            </p>
          ) : (
            <>
              <DailyUsers daily={summary.daily} />
              <Funnel funnel={summary.funnel} />
              <div className="grid gap-6 md:grid-cols-2">
                <Table
                  title="Top screens"
                  head={["Screen", "Views", "Users"]}
                  rows={summary.screens.map((s) => [s.screen, fmt(s.views), fmt(s.users)])}
                  empty="No screen views yet."
                />
                <Table
                  title="Your events"
                  head={["Event", "Count", "Users"]}
                  rows={summary.events.map((e) => [e.name, fmt(e.count), fmt(e.users)])}
                  empty="None yet. Ask in the chat to track something people do."
                />
              </div>
              {summary.platforms.length > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {summary.platforms
                    .map((p) => `${PLATFORM_LABEL[p.platform] ?? p.platform}: ${fmt(p.users)}`)
                    .join(" · ")}
                </p>
              ) : null}
            </>
          )}
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border bg-background p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {note ? <div className="mt-0.5 text-xs text-muted-foreground">{note}</div> : null}
    </div>
  );
}

/** Daily active users: one column per day, hover or focus a column for its numbers. */
function DailyUsers({ daily }: { daily: Summary["daily"] }) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = Math.max(1, ...daily.map((d) => d.users));
  // Clean y-axis top: 1, 2, 5 × 10^n at or above the max.
  const magnitude = 10 ** Math.floor(Math.log10(max));
  const top = [1, 2, 5, 10].map((m) => m * magnitude).find((t) => t >= max) ?? max;
  const shown = active === null ? null : daily[active];
  return (
    <section className="rounded-xl border bg-background p-4" data-testid="analytics-daily">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium">Daily users</h3>
        <Button size="sm" variant="ghost" onClick={() => setAsTable((v) => !v)}>
          {asTable ? "Show chart" : "Show table"}
        </Button>
      </div>
      {asTable ? (
        <Table
          head={["Day", "Users", "New"]}
          rows={[...daily].reverse().map((d) => [dayLabel(d.day), fmt(d.users), fmt(d.newUsers)])}
          empty=""
        />
      ) : (
        <div className="relative">
          <div className="flex h-40 gap-3">
            <div className="flex w-8 flex-col justify-between text-right text-[11px] text-muted-foreground tabular-nums">
              <span>{fmt(top)}</span>
              <span>0</span>
            </div>
            <div className="relative flex-1">
              <div className="absolute inset-x-0 top-0 h-px bg-border" />
              <div className="absolute inset-x-0 bottom-0 h-px bg-border" />
              <div className="flex h-full items-end gap-0.5">
                {daily.map((d, i) => (
                  <button
                    key={d.day}
                    type="button"
                    className="group flex h-full flex-1 items-end justify-center outline-none"
                    onPointerEnter={() => setActive(i)}
                    onPointerLeave={() => setActive(null)}
                    onFocus={() => setActive(i)}
                    onBlur={() => setActive(null)}
                    aria-label={`${dayLabel(d.day)}: ${d.users} users, ${d.newUsers} new`}
                  >
                    <span
                      className={`block w-full max-w-6 rounded-t-[4px] ${BAR} transition-opacity group-hover:opacity-80 group-focus-visible:opacity-80`}
                      style={{ height: d.users > 0 ? `max(2px, ${(d.users / top) * 100}%)` : 0 }}
                    />
                  </button>
                ))}
              </div>
              {shown ? (
                <div
                  className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
                  style={{ left: `${((active! + 0.5) / daily.length) * 100}%` }}
                >
                  <div className="font-semibold tabular-nums">{fmt(shown.users)} users</div>
                  <div className="text-muted-foreground">
                    {fmt(shown.newUsers)} new · {dayLabel(shown.day)}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
          <div className="ml-11 mt-1 flex justify-between text-[11px] text-muted-foreground">
            <span>{dayLabel(daily[0]!.day)}</span>
            <span>{dayLabel(daily[daily.length - 1]!.day)}</span>
          </div>
        </div>
      )}
    </section>
  );
}

/** The money funnel: one hue, each bar's share of the people who opened the app at its tip. */
function Funnel({ funnel }: { funnel: Summary["funnel"] }) {
  const opened = Math.max(1, funnel[0]?.users ?? 0);
  return (
    <section className="rounded-xl border bg-background p-4" data-testid="analytics-funnel">
      <h3 className="mb-1 text-sm font-medium">From first open to paying</h3>
      <p className="mb-4 text-xs text-muted-foreground">
        People who reached each step in the last 30 days. Simulated purchases aren&rsquo;t counted.
      </p>
      <ol className="space-y-3">
        {funnel.map((s) => {
          const share = s.users / opened;
          return (
            <li
              key={s.step}
              className="grid grid-cols-[minmax(0,13rem)_1fr] items-center gap-3 text-sm"
            >
              <span className="text-muted-foreground">{STEP_LABEL[s.step]}</span>
              <div className="flex items-center gap-2">
                <span
                  className={`block h-5 rounded-r-[4px] ${BAR}`}
                  style={{ width: s.users > 0 ? `max(2px, ${share * 75}%)` : 0 }}
                />
                <span className="whitespace-nowrap tabular-nums">
                  <span className="font-medium">{fmt(s.users)}</span>
                  <span className="text-muted-foreground"> · {Math.round(share * 100)}%</span>
                </span>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function Table({
  title,
  head,
  rows,
  empty,
}: {
  title?: string;
  head: string[];
  rows: string[][];
  empty: string;
}) {
  return (
    <section className={title ? "rounded-xl border bg-background p-4" : ""}>
      {title ? <h3 className="mb-2 text-sm font-medium">{title}</h3> : null}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">{empty}</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              {head.map((h, i) => (
                <th key={h} className={`pb-1 font-normal ${i > 0 ? "text-right" : ""}`}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-t">
                {row.map((cell, i) => (
                  <td
                    key={i}
                    className={`py-1.5 ${i > 0 ? "text-right tabular-nums" : "max-w-0 truncate font-mono text-xs"}`}
                  >
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
