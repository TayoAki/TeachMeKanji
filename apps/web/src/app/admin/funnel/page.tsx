import Link from "next/link";
import { notFound } from "next/navigation";
import { funnelReport, isAdminEmail } from "@appbuilder/core";
import { AppShell } from "@/components/shell/app-shell";
import { cn } from "@/lib/utils";
import { db, getViewer } from "@/lib/server";

export const metadata = { title: "Funnel", robots: { index: false } };

const PERIODS = [
  { days: 7, label: "7 days" },
  { days: 30, label: "30 days" },
  { days: 90, label: "90 days" },
  { days: 0, label: "All time" },
];

const percent = (part: number, whole: number) =>
  whole ? `${Math.round((part / whole) * 100)}%` : "–";

/**
 * App Builder's own funnel for the operator (ADMIN_EMAILS): of the people who signed up in the
 * period, how many reached each step, where they drop off, and how sign-ups trend by day.
 */
export default async function AdminFunnelPage({ searchParams }: PageProps<"/admin/funnel">) {
  const viewer = await getViewer();
  if (!viewer || !isAdminEmail(viewer.email)) notFound();
  const asked = Number((await searchParams).days ?? 30);
  const days = PERIODS.some((p) => p.days === asked) ? asked : 30;
  const report = await funnelReport(db(), days || null);
  const top = report.steps[0]!.users;
  const peak = Math.max(1, ...report.daily.map((d) => d.signups));

  return (
    <AppShell user={{ name: viewer.name, email: viewer.email, image: viewer.image }}>
      <div className="mx-auto max-w-4xl space-y-8 p-6" data-testid="admin-funnel">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold">Funnel</h1>
            <p className="text-sm text-muted-foreground">
              People who signed up in the period, and how far they got. Your own accounts
              (ADMIN_EMAILS) are left out. <Link href="/admin/feedback">Feedback →</Link>
            </p>
          </div>
          <nav className="flex gap-1 text-sm">
            {PERIODS.map((p) => (
              <Link
                key={p.days}
                href={`/admin/funnel?days=${p.days}`}
                className={cn(
                  "rounded-md border px-2.5 py-1",
                  p.days === days ? "border-foreground bg-muted" : "hover:bg-muted",
                )}
              >
                {p.label}
              </Link>
            ))}
          </nav>
        </div>

        <section className="space-y-2" data-testid="funnel-steps">
          {report.steps.map((step, i) => {
            const previous = i ? report.steps[i - 1]!.users : step.users;
            return (
              <div
                key={step.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{step.label}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">
                      {i ? `${percent(step.users, previous)} of the step before` : ""}
                    </span>
                  </div>
                  <div className="mt-1 h-2.5 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: top ? `${(step.users / top) * 100}%` : 0 }}
                    />
                  </div>
                </div>
                <div className="w-24 text-right tabular-nums">
                  <span className="font-semibold" data-testid={`funnel-${step.key}`}>
                    {step.users}
                  </span>{" "}
                  <span className="text-xs text-muted-foreground">{percent(step.users, top)}</span>
                </div>
              </div>
            );
          })}
        </section>

        <section className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Came back another day"
            value={`${report.returning}`}
            hint="used the AI on 2+ days"
          />
          <Stat
            label="Time to first app"
            value={
              report.medianHoursToFirstBuild === null
                ? "–"
                : report.medianHoursToFirstBuild < 1
                  ? `${Math.round(report.medianHoursToFirstBuild * 60)} min`
                  : `${report.medianHoursToFirstBuild} h`
            }
            hint="median, sign-up to first build"
          />
          <Stat
            label="App Store check"
            value={`${report.leads.total}`}
            hint={`took it · ${report.leads.signedUp} have an account`}
          />
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium">Sign-ups by day</h2>
          {report.daily.length ? (
            <div
              className="flex h-32 items-end gap-1 rounded-xl border p-3"
              data-testid="funnel-daily"
            >
              {report.daily.map((d) => (
                <div
                  key={d.day}
                  title={`${d.day}: ${d.signups}`}
                  className="flex-1 rounded-t bg-primary/80"
                  style={{ height: `${(d.signups / peak) * 100}%`, minHeight: 2 }}
                />
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No sign-ups in this period.</p>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="rounded-xl border p-4">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="text-xs text-muted-foreground">{hint}</div>
    </div>
  );
}
