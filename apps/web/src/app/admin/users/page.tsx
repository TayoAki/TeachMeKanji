import Link from "next/link";
import { notFound } from "next/navigation";
import { adminUsers, creditsToUsd, isAdminEmail } from "@appbuilder/core";
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

export const metadata = { title: "Users", robots: { index: false } };

/**
 * Every account for the operator (ADMIN_EMAILS): the apps each one made, how many AI runs they
 * took and what those cost, most expensive first.
 */
export default async function AdminUsersPage({ searchParams }: PageProps<"/admin/users">) {
  const viewer = await getViewer();
  if (!viewer || !isAdminEmail(viewer.email)) notFound();
  const params = await searchParams;
  const days = adminPeriod(params.days);
  const search = String(Array.isArray(params.q) ? params.q[0] : (params.q ?? "")).slice(0, 100);
  const report = await adminUsers(db(), { sinceDays: days || null, search });
  const { totals } = report;
  const query = (d: number) =>
    `/admin/users?days=${d}${search ? `&q=${encodeURIComponent(search)}` : ""}`;

  return (
    <AppShell user={{ name: viewer.name, email: viewer.email, image: viewer.image }}>
      <div className="mx-auto max-w-6xl space-y-6 p-6" data-testid="admin-users">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="space-y-1">
            <AdminNav current="users" />
            <h1 className="text-2xl font-semibold">Users</h1>
            <p className="text-sm text-muted-foreground">
              Every account, the apps it made and what its AI runs cost. Runs are counted for the
              period; apps and credit balances are as of now.
            </p>
          </div>
          <PeriodLinks days={days} href={query} />
        </div>

        <section className="grid gap-3 sm:grid-cols-4">
          <Stat label="Accounts" value={`${totals.users}`} hint={`${totals.apps} apps`} />
          <Stat
            label="AI runs"
            value={compact(totals.runs)}
            hint={`${totals.failedRuns} failed (free to the user)`}
          />
          <Stat
            label="Cost to you"
            value={usd(totals.costUsd)}
            hint={
              totals.estimatedRuns || totals.unpricedRuns
                ? `${totals.estimatedRuns} runs estimated, ${totals.unpricedRuns} unpriced`
                : "model and image spend"
            }
          />
          <Stat
            label="Credits charged"
            value={compact(totals.creditsCharged)}
            hint={`worth ${usd(creditsToUsd(totals.creditsCharged))}`}
          />
        </section>

        <form action="/admin/users" className="flex gap-2">
          <input type="hidden" name="days" value={days} />
          <input
            name="q"
            defaultValue={search}
            placeholder="Search by email or name"
            className="h-9 w-72 rounded-md border bg-background px-3 text-sm"
          />
          <button type="submit" className="h-9 rounded-md border px-3 text-sm hover:bg-muted">
            Search
          </button>
          {search ? (
            <Link href={`/admin/users?days=${days}`} className="self-center text-sm">
              Clear
            </Link>
          ) : null}
        </form>

        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full text-sm" data-testid="admin-users-table">
            <thead className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 font-medium">Plan</th>
                <th className="px-3 py-2 text-right font-medium">Apps</th>
                <th className="px-3 py-2 text-right font-medium">Runs</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
                <th className="px-3 py-2 text-right font-medium">Credits charged</th>
                <th className="px-3 py-2 text-right font-medium">Credits left</th>
                <th className="px-3 py-2 font-medium">Signed up</th>
                <th className="px-3 py-2 font-medium">Last run</th>
              </tr>
            </thead>
            <tbody>
              {report.users.map((user) => (
                <tr key={user.id} className="border-b last:border-0 hover:bg-muted/40">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/users/${user.id}?days=${days}`}
                      className="font-medium"
                      data-testid="admin-user-link"
                    >
                      {user.email}
                    </Link>
                    <div className="text-xs text-muted-foreground">
                      {user.name}
                      {user.emailVerified ? "" : " · email not verified"}
                    </div>
                  </td>
                  <td className="px-3 py-2 capitalize">{user.plan}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {user.apps}
                    {user.deletedApps ? (
                      <span className="text-muted-foreground"> +{user.deletedApps} deleted</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {user.runs}
                    {user.failedRuns ? (
                      <span className="text-muted-foreground"> ({user.failedRuns} failed)</span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    <Cost totals={user} />
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{user.creditsCharged}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{user.creditBalance}</td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {day(user.createdAt).slice(0, 10)}
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground">
                    {day(user.lastRunAt)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {report.users.length ? null : (
            <p className="p-4 text-sm text-muted-foreground">No accounts match.</p>
          )}
        </div>
        <CostNote />
      </div>
    </AppShell>
  );
}
