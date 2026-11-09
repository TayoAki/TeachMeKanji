"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Github, KeyRound, Loader2, Smartphone } from "lucide-react";
import { toast } from "sonner";
import { AppShell, PanelSection } from "@/components/shell/app-shell";
import type { RailUser } from "@/components/shell/left-rail";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { TimeAgo } from "@/components/time-ago";

export interface SettingsData {
  user: RailUser;
  credits: number;
  plan: "free" | "pro";
  limits: {
    name: string;
    monthlyCredits: number;
    maxProjects: number | null;
    maxScreensPerProject: number;
    nativeBuilds: boolean;
  };
  ledger: Array<{
    id: number;
    delta: number;
    reason: string;
    note: string | null;
    createdAt: string;
  }>;
  integrations: Array<{ provider: "github" | "expo"; label: string | null }>;
  billingEnabled: boolean;
}

const REASONS: Record<string, string> = {
  grant: "Credits granted",
  reserve: "Reserved for a run",
  release: "Reservation released",
  settle: "Charged",
  purchase: "Purchased",
  monthly: "Monthly credits",
};

function Integration({
  provider,
  connected,
  onChanged,
}: {
  provider: "github" | "expo";
  connected: { label: string | null } | undefined;
  onChanged: () => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const meta =
    provider === "github"
      ? {
          title: "GitHub",
          icon: <Github className="size-5" />,
          help: "A fine-grained personal access token with Contents and Pull requests (read & write) and Administration (for creating repos).",
          link: "https://github.com/settings/personal-access-tokens/new",
        }
      : {
          title: "Expo (EAS Build)",
          icon: <Smartphone className="size-5" />,
          help: "An Expo access token, so builds run on your own Expo account.",
          link: "https://expo.dev/settings/access-tokens",
        };
  return (
    <div className="rounded-xl border bg-background p-4" data-testid={`integration-${provider}`}>
      <div className="flex items-center gap-3">
        {meta.icon}
        <div className="flex-1">
          <div className="font-medium">{meta.title}</div>
          <div className="text-xs text-muted-foreground">
            {connected ? `Connected · ${connected.label}` : meta.help}
          </div>
        </div>
        {connected ? (
          <Button
            variant="outline"
            size="sm"
            onClick={async () => {
              await api(`/api/integrations/${provider}`, { method: "DELETE" });
              onChanged();
            }}
          >
            Disconnect
          </Button>
        ) : null}
      </div>
      {!connected ? (
        <div className="mt-3 flex gap-2">
          <Input
            type="password"
            placeholder="Paste token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            aria-label={`${meta.title} token`}
          />
          <Button
            disabled={token.length < 10 || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api(`/api/integrations/${provider}`, { method: "PUT", json: { token } });
                toast.success(`${meta.title} connected`);
                setToken("");
                onChanged();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Connect
          </Button>
        </div>
      ) : null}
      {!connected ? (
        <a
          href={meta.link}
          target="_blank"
          rel="noreferrer"
          className="mt-2 inline-block text-xs underline"
        >
          Create a token
        </a>
      ) : null}
      <p className="mt-2 text-[11px] text-muted-foreground">
        Tokens are encrypted at rest and only used for the actions you start.
      </p>
    </div>
  );
}

export function SettingsView({ initial }: { initial: SettingsData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const refresh = async () => setData(await api<SettingsData>("/api/me", { quiet: true }));

  const portal = async () => {
    const { url } = await api<{ url: string }>("/api/billing/portal", { method: "POST" });
    location.href = url;
  };

  return (
    <AppShell
      user={data.user}
      active="settings"
      tabs={<span className="px-2 text-sm font-semibold">Settings</span>}
      aside={
        <PanelSection title="Plan">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-semibold">{data.limits.name}</span>
            {data.plan === "pro" ? <Badge>Active</Badge> : null}
          </div>
          <ul className="mt-3 space-y-1 text-sm text-muted-foreground">
            <li>
              {data.limits.maxProjects === null
                ? "Unlimited projects"
                : `${data.limits.maxProjects} projects`}
            </li>
            <li>Up to {data.limits.maxScreensPerProject} screens per app</li>
            <li>
              {data.limits.nativeBuilds
                ? "Android & iOS builds"
                : "Web publishing and source export"}
            </li>
            {data.limits.monthlyCredits ? (
              <li>{data.limits.monthlyCredits} credits every month</li>
            ) : null}
          </ul>
          {data.plan === "pro" ? (
            <Button variant="outline" size="sm" className="mt-4 w-full" onClick={portal}>
              Manage subscription
            </Button>
          ) : (
            <Button asChild size="sm" className="mt-4 w-full">
              <Link href="/pricing">Upgrade to Pro</Link>
            </Button>
          )}
        </PanelSection>
      }
      bottomLeft={<span>{data.user.email}</span>}
      bottomRight={<span>{data.credits} credits</span>}
    >
      <div className="mx-auto max-w-2xl space-y-10 p-6">
        <section>
          <h2 className="mb-3 text-lg font-semibold">Credits</h2>
          <div className="rounded-xl border bg-background">
            <div className="flex items-baseline gap-2 border-b p-4">
              <span className="text-3xl font-semibold" data-testid="settings-credits">
                {data.credits}
              </span>
              <span className="text-sm text-muted-foreground">credits available</span>
            </div>
            <ul className="max-h-80 divide-y overflow-auto text-sm" data-testid="ledger">
              {data.ledger
                .filter((l) => l.reason !== "reserve" && l.reason !== "release")
                .map((l) => (
                  <li key={l.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="flex-1">{l.note ?? REASONS[l.reason] ?? l.reason}</span>
                    <span className="text-xs text-muted-foreground">
                      <TimeAgo date={l.createdAt} />
                    </span>
                    <span
                      className={`w-14 text-right tabular-nums ${l.delta < 0 ? "" : "text-emerald-600"}`}
                    >
                      {l.delta > 0 ? "+" : ""}
                      {l.delta}
                    </span>
                  </li>
                ))}
            </ul>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Runs are charged by what the AI actually used. Failed or cancelled runs are free.
          </p>
        </section>

        <section id="integrations">
          <h2 className="mb-3 text-lg font-semibold">Integrations</h2>
          <div className="space-y-3">
            <Integration
              provider="github"
              connected={data.integrations.find((i) => i.provider === "github")}
              onChanged={refresh}
            />
            <Integration
              provider="expo"
              connected={data.integrations.find((i) => i.provider === "expo")}
              onChanged={refresh}
            />
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-lg font-semibold">Account</h2>
          <div className="flex items-center gap-3 rounded-xl border bg-background p-4">
            <div className="flex-1">
              <div className="font-medium">{data.user.name}</div>
              <div className="text-sm text-muted-foreground">{data.user.email}</div>
            </div>
            <Button
              variant="outline"
              onClick={async () => {
                await authClient.signOut();
                router.push("/");
                router.refresh();
              }}
            >
              Sign out
            </Button>
          </div>
        </section>
      </div>
    </AppShell>
  );
}
