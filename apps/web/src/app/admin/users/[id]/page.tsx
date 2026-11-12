import Link from "next/link";
import { notFound } from "next/navigation";
import { adminUser, creditsToUsd, isAdminEmail } from "@appbuilder/core";
import {
  adminPeriod,
  AdminNav,
  compact,
  Cost,
  CostNote,
  day,
  PeriodLinks,
  Stat,
  usd,
} from "@/components/admin-ui";
import { AppShell } from "@/components/shell/app-shell";
import { db, getViewer } from "@/lib/server";

export const metadata = { title: "User", robots: { index: false } };

/** One account for the operator (ADMIN_EMAILS): its apps, cost by kind of run, and its runs. */
export default async function AdminUserPage({
  params,
  searchParams,
}: PageProps<"/admin/users/[id]">) {
  const viewer = await getViewer();
  if (!viewer || !isAdminEmail(viewer.email)) notFound();
  const { id } = await params;
  const days = adminPeriod((await searchParams).days);
  const detail = await adminUser(db(), id, { sinceDays: days || null });
  if (!detail) notFound();
  const { user, apps, byKind, runs } = detail;

  return (
    <AppShell user={{ name: viewer.name, email: viewer.email, image: viewer.image }}>
      <div className="mx-auto max-w-6xl space-y-6 p-6" data-testid="admin-user">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <AdminNav current="users" />
            <h1 className="text-2xl font-semibold">{user.email}</h1>
            <p className="text-sm text-muted-foreground">
              {user.name} · signed up {day(user.createdAt).slice(0, 10)} ·{" "}
              <span className="capitalize">{user.plan}</span> plan
              {user.emailVerified ? "" : " · email not verified"} ·{" "}
              <Link href={`/admin/users?days=${days}`}>All users</Link>
            </p>
          </div>
          <PeriodLinks days={days} href={(d) => `/admin/users/${user.id}?days=${d}`} />
        </div>

        <section className="grid gap-3 sm:grid-cols-4">
          <Stat
            label="Apps"
            value={`${user.apps}`}
            hint={user.deletedApps ? `${user.deletedApps} deleted` : "not deleted"}
          />
          <Stat label="AI runs" value={`${user.runs}`} hint={`${user.failedRuns} failed`} />
          <Stat
            label="Cost to you"
            value={usd(user.costUsd)}
            hint={`${compact(user.tokensIn)} tokens in, ${compact(user.tokensOut)} out`}
          />
          <Stat
            label="Credits charged"
            value={`${user.creditsCharged}`}
            hint={`worth ${usd(creditsToUsd(user.creditsCharged))} · ${user.creditBalance} left`}
          />
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Apps</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm" data-testid="admin-user-apps">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">App</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Versions</th>
                  <th className="px-3 py-2 text-right font-medium">Runs</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Credits</th>
                  <th className="px-3 py-2 font-medium">Created</th>
                  <th className="px-3 py-2 font-medium">Last run</th>
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => (
                  <tr key={app.id} className="border-b align-top last:border-0">
                    <td className="max-w-md px-3 py-2">
                      <div className="font-medium">{app.name}</div>
                      <div
                        className="line-clamp-2 text-xs text-muted-foreground"
                        title={app.prompt}
                      >
                        {app.prompt}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      {app.deletedAt ? "deleted" : app.status}
                      <div className="text-xs text-muted-foreground">
                        {app.backend === "cloud" ? "App Cloud" : "on device"}
                        {app.publishedSlug ? " · published" : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{app.versions}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {app.runs}
                      {app.failedRuns ? (
                        <span className="text-muted-foreground"> ({app.failedRuns} failed)</span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Cost totals={app} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{app.creditsCharged}</td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {day(app.createdAt).slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {day(app.lastRunAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {apps.length ? null : (
              <p className="p-4 text-sm text-muted-foreground">This account owns no apps.</p>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            An app&apos;s runs include those its collaborators started; the account totals above
            count only the runs this account started.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">Cost by kind of run</h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm" data-testid="admin-user-kinds">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 text-right font-medium">Runs</th>
                  <th className="px-3 py-2 text-right font-medium">Failed</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Cost per run</th>
                  <th className="px-3 py-2 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {byKind.map((kind) => (
                  <tr key={kind.kind} className="border-b last:border-0">
                    <td className="px-3 py-2">{kind.kind.replaceAll("_", " ")}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{kind.runs}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{kind.failedRuns}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <Cost totals={kind} />
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {kind.runs ? usd(kind.costUsd / kind.runs) : "–"}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{kind.creditsCharged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {byKind.length ? null : (
              <p className="p-4 text-sm text-muted-foreground">No runs in this period.</p>
            )}
          </div>
        </section>

        <section className="space-y-2">
          <h2 className="text-sm font-medium">
            Runs{runs.length < user.runs ? ` (latest ${runs.length} of ${user.runs})` : ""}
          </h2>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm" data-testid="admin-user-runs">
              <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">App</th>
                  <th className="px-3 py-2 font-medium">Kind</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">Model</th>
                  <th className="px-3 py-2 text-right font-medium">Tokens in / out</th>
                  <th className="px-3 py-2 text-right font-medium">Time</th>
                  <th className="px-3 py-2 text-right font-medium">Cost</th>
                  <th className="px-3 py-2 text-right font-medium">Credits</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((run) => (
                  <tr key={run.id} className="border-b align-top last:border-0">
                    <td className="px-3 py-2 tabular-nums text-muted-foreground">
                      {day(run.createdAt)}
                    </td>
                    <td className="max-w-48 truncate px-3 py-2">{run.projectName}</td>
                    <td className="px-3 py-2">{run.kind.replaceAll("_", " ")}</td>
                    <td className="max-w-64 px-3 py-2">
                      {run.status}
                      {run.error ? (
                        <div
                          className="line-clamp-2 text-xs text-muted-foreground"
                          title={run.error}
                        >
                          {run.error}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-xs text-muted-foreground">{run.model ?? "–"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {compact(run.tokensIn + run.cacheReadTokens + run.cacheWriteTokens)} /{" "}
                      {compact(run.tokensOut)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {run.seconds === null ? "–" : `${Math.round(run.seconds)}s`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {run.costUsd === null ? "–" : usd(run.costUsd)}
                      {run.costUsd !== null && run.costEstimated && run.costUsd > 0 ? (
                        <span className="text-muted-foreground" title="Estimated from tokens">
                          *
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{run.creditsCharged}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {runs.length ? null : (
              <p className="p-4 text-sm text-muted-foreground">No runs in this period.</p>
            )}
          </div>
          <CostNote />
        </section>
      </div>
    </AppShell>
  );
}
