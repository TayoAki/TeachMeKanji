"use client";

import { useEffect, useState } from "react";
import { Bell, Cloud, Database, Loader2, Send, Sparkles, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";
import { TimeAgo } from "@/components/time-ago";

interface DataSummary {
  backend: "local" | "cloud";
  users: { total: number; signedUp: number };
  collections: Array<{ name: string; records: number }>;
  recent: Array<{
    collection: string;
    id: string;
    data: Record<string, unknown>;
    updatedAt: string;
    owner: string;
  }>;
  accounts: Array<{ email: string | null; name: string | null; createdAt: string }>;
  /** AI answers the app's users got this month, and the credits they cost. */
  ai: { calls: number; credits: number };
}

/** Right-sidebar panel: where the app's data lives, and the switch to App Cloud. */
export function AppCloudPanel({
  projectId,
  backend,
  canManage,
  disabled,
  onChanged,
  onOpenData,
}: {
  projectId: string;
  backend: "local" | "cloud";
  canManage: boolean;
  disabled: boolean;
  onChanged: () => void;
  onOpenData: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const toggle = async (enabled: boolean) => {
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/backend`, { method: "POST", json: { enabled } });
      toast.success(enabled ? "App Cloud connected" : "App Cloud disconnected");
      onChanged();
    } catch {
      // api() already showed the error
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="border-b p-4" data-testid="app-cloud-panel">
      <div className="mb-2 flex items-center gap-2">
        <Cloud className="size-4" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          App Cloud
        </h2>
        <Badge variant={backend === "cloud" ? "default" : "outline"} className="ml-auto">
          {backend === "cloud" ? "Connected" : "On device"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {backend === "cloud"
          ? "Data is saved in the cloud for each user of your app, and the app can have sign-in. Ask the agent to “add a sign in screen”."
          : "Data is stored on each device. Connect App Cloud to sync data per user and add accounts, with no setup."}
      </p>
      <div className="mt-3 flex items-center gap-2">
        {canManage ? (
          <label className="flex items-center gap-2 text-sm">
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            <Switch
              checked={backend === "cloud"}
              onCheckedChange={toggle}
              disabled={busy || disabled}
              aria-label="Use App Cloud"
              data-testid="app-cloud-toggle"
            />
            Use App Cloud
          </label>
        ) : null}
        {backend === "cloud" ? (
          <Button size="sm" variant="ghost" className="ml-auto h-7" onClick={onOpenData}>
            <Database /> View data
          </Button>
        ) : null}
      </div>
    </section>
  );
}

/** The Data tab: the app's users and records in App Cloud. */
export function DataView({
  projectId,
  canManage,
  refreshKey,
}: {
  projectId: string;
  canManage: boolean;
  refreshKey: unknown;
}) {
  const [data, setData] = useState<DataSummary | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let alive = true;
    api<DataSummary>(`/api/projects/${projectId}/data`, { quiet: true })
      .then((d) => alive && setData(d))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [projectId, refreshKey, tick]);

  if (!data) return <div className="p-6 text-sm text-muted-foreground">Loading data…</div>;
  if (data.backend !== "cloud") {
    return (
      <div
        className="flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground"
        data-testid="data-view"
      >
        <div className="max-w-sm">
          <Database className="mx-auto mb-3 size-6" />
          This app keeps its data on each device. Turn on App Cloud in the right panel to store data
          per user and see it here.
        </div>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-4xl space-y-6 p-6" data-testid="data-view">
      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border bg-background p-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Users className="size-3.5" /> Users
          </div>
          <div className="mt-1 text-2xl font-semibold" data-testid="data-users">
            {data.users.total}
          </div>
          <div className="text-xs text-muted-foreground">{data.users.signedUp} with an account</div>
        </div>
        {data.ai.calls > 0 ? (
          <div className="rounded-xl border bg-background p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Sparkles className="size-3.5" /> AI this month
            </div>
            <div className="mt-1 text-2xl font-semibold" data-testid="data-ai-calls">
              {data.ai.calls}
            </div>
            <div className="text-xs text-muted-foreground">
              answers · {data.ai.credits} {data.ai.credits === 1 ? "credit" : "credits"}
            </div>
          </div>
        ) : null}
        {data.collections.map((c) => (
          <div key={c.name} className="rounded-xl border bg-background p-4">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Database className="size-3.5" /> {c.name}
            </div>
            <div className="mt-1 text-2xl font-semibold" data-testid={`data-collection-${c.name}`}>
              {c.records}
            </div>
            <div className="text-xs text-muted-foreground">records</div>
          </div>
        ))}
      </div>

      {data.accounts.length > 0 ? (
        <section>
          <h3 className="mb-2 text-sm font-semibold">Accounts</h3>
          <ul
            className="divide-y rounded-xl border bg-background text-sm"
            data-testid="data-accounts"
          >
            {data.accounts.map((a) => (
              <li key={a.email} className="flex items-center gap-3 px-4 py-2">
                <span className="flex-1">{a.email}</span>
                <span className="text-xs text-muted-foreground">
                  <TimeAgo date={a.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <PushSection projectId={projectId} canManage={canManage} />

      <section>
        <div className="mb-2 flex items-center">
          <h3 className="text-sm font-semibold">Recent records</h3>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7"
            onClick={() => setTick((t) => t + 1)}
          >
            Refresh
          </Button>
        </div>
        <div className="overflow-auto rounded-xl border bg-background">
          <table className="w-full text-left text-xs">
            <thead className="border-b text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-medium">Collection</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Data</th>
                <th className="px-3 py-2 font-medium">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y" data-testid="data-records">
              {data.recent.map((r) => (
                <tr key={`${r.collection}/${r.owner}/${r.id}`}>
                  <td className="px-3 py-2">{r.collection}</td>
                  <td className="px-3 py-2">{r.owner}</td>
                  <td className="max-w-md truncate px-3 py-2 font-mono">
                    {JSON.stringify({ id: r.id, ...r.data })}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">
                    <TimeAgo date={r.updatedAt} />
                  </td>
                </tr>
              ))}
              {data.recent.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">
                    No records yet. Use the app in the preview.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      {canManage ? (
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            if (!window.confirm("Delete all users and records of this app? This can't be undone."))
              return;
            await api(`/api/projects/${projectId}/data`, { method: "DELETE" });
            toast.success("App data cleared");
            setTick((t) => t + 1);
          }}
        >
          <Trash2 /> Clear all app data
        </Button>
      ) : null}
    </div>
  );
}

interface PushSummary {
  devices: number;
  recent: Array<{
    id: string;
    title: string;
    body: string;
    sent: { ok: number; failed: number; removed: number };
    createdAt: string;
  }>;
}

/** Notifications to the app's users who allowed them (registerForPush() in the app). */
function PushSection({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [summary, setSummary] = useState<PushSummary | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    api<PushSummary>(`/api/projects/${projectId}/push`, { quiet: true })
      .then(setSummary)
      .catch(() => {});
  }, [projectId, tick]);
  if (!summary) return null;
  return (
    <section data-testid="data-push">
      <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
        <Bell className="size-4" /> Notifications
      </h3>
      <div className="rounded-xl border bg-background p-4">
        <p className="text-sm text-muted-foreground">
          <span className="font-semibold text-foreground" data-testid="push-devices">
            {summary.devices}
          </span>{" "}
          {summary.devices === 1 ? "phone gets" : "phones get"} notifications. People opt in from
          the app (it asks with registerForPush()); it works in store and TestFlight builds, not in
          Expo Go.
        </p>
        {canManage ? (
          <form
            className="mt-3 grid gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setSending(true);
              try {
                const { sent } = await api<{ sent: PushSummary["recent"][number]["sent"] }>(
                  `/api/projects/${projectId}/push`,
                  { method: "POST", json: { title, body: message } },
                );
                toast.success(`Sent to ${sent.ok} ${sent.ok === 1 ? "phone" : "phones"}`);
                setTitle("");
                setMessage("");
                setTick((t) => t + 1);
              } catch {
                // api() showed why.
              } finally {
                setSending(false);
              }
            }}
          >
            <Input
              placeholder="Title"
              value={title}
              maxLength={80}
              onChange={(e) => setTitle(e.target.value)}
              aria-label="Notification title"
            />
            <Input
              placeholder="Message"
              value={message}
              maxLength={240}
              onChange={(e) => setMessage(e.target.value)}
              aria-label="Notification message"
            />
            <Button
              type="submit"
              size="sm"
              className="justify-self-start"
              disabled={!title.trim() || !message.trim() || sending}
              data-testid="push-send"
            >
              {sending ? <Loader2 className="animate-spin" /> : <Send />} Send to everyone
            </Button>
          </form>
        ) : null}
        {summary.recent.length ? (
          <ul className="mt-3 divide-y border-t text-xs" data-testid="push-history">
            {summary.recent.map((b) => (
              <li key={b.id} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium">{b.title}</span> · {b.body}
                </span>
                <span className="text-muted-foreground">
                  {b.sent.ok} delivered{b.sent.failed ? `, ${b.sent.failed} failed` : ""}
                </span>
                <span className="text-muted-foreground">
                  <TimeAgo date={b.createdAt} />
                </span>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </section>
  );
}
