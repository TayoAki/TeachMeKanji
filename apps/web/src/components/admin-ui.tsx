import Link from "next/link";
import type { RunTotals } from "@appbuilder/core";
import { cn } from "@/lib/utils";

/** Shared pieces of the operator's pages (/admin/...). */

export const ADMIN_PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 0, label: "All time" },
];

/** The period asked for in `?days=`, or all time. */
export function adminPeriod(value: string | string[] | undefined): number {
  const asked = Number(Array.isArray(value) ? value[0] : (value ?? 0));
  return ADMIN_PERIODS.some((p) => p.days === asked) ? asked : 0;
}

export const usd = (value: number) =>
  value >= 100
    ? `$${value.toFixed(0)}`
    : value >= 0.995
      ? `$${value.toFixed(2)}`
      : `$${value.toFixed(3)}`;

export const compact = (value: number) =>
  new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);

export const day = (date: Date | null) =>
  date ? date.toISOString().slice(0, 16).replace("T", " ") : "–";

export function AdminNav({ current }: { current: "users" | "funnel" | "feedback" }) {
  const pages = [
    { key: "users", href: "/admin/users", label: "Users" },
    { key: "funnel", href: "/admin/funnel", label: "Funnel" },
    { key: "feedback", href: "/admin/feedback", label: "Feedback" },
  ] as const;
  return (
    <nav className="flex gap-3 text-sm" data-testid="admin-nav">
      {pages.map((page) => (
        <Link
          key={page.key}
          href={page.href}
          className={cn(page.key === current ? "font-semibold" : "text-muted-foreground")}
        >
          {page.label}
        </Link>
      ))}
    </nav>
  );
}

export function PeriodLinks({ days, href }: { days: number; href: (days: number) => string }) {
  return (
    <nav className="flex gap-1 text-sm">
      {ADMIN_PERIODS.map((p) => (
        <Link
          key={p.days}
          href={href(p.days)}
          className={cn(
            "rounded-md border px-2.5 py-1",
            p.days === days ? "border-foreground bg-muted" : "hover:bg-muted",
          )}
        >
          {p.label}
        </Link>
      ))}
    </nav>
  );
}

export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

/** A cost with a mark when part of it is an estimate or some runs could not be priced. */
export function Cost({
  totals,
}: {
  totals: Pick<RunTotals, "costUsd" | "estimatedRuns" | "unpricedRuns">;
}) {
  const notes = [
    totals.estimatedRuns ? `${totals.estimatedRuns} run(s) estimated from tokens` : "",
    totals.unpricedRuns
      ? `${totals.unpricedRuns} run(s) on a model with no price: not counted`
      : "",
  ].filter(Boolean);
  return (
    <span title={notes.join("; ") || undefined}>
      {usd(totals.costUsd)}
      {notes.length ? <span className="text-muted-foreground">*</span> : null}
    </span>
  );
}

/** What estimates and gaps mean, shown under a table that has them. */
export function CostNote() {
  return (
    <p className="text-xs text-muted-foreground">
      Cost is model and image spend. * Some runs finished before their cost was recorded, so it is
      estimated from their tokens at list prices (low for runs that made images), or the model has
      no price and the run is left out. Hover a starred cost for the count.
    </p>
  );
}
