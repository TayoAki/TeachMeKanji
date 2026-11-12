"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  AlertTriangle,
  Check,
  CircleCheck,
  CircleX,
  Copy,
  Download,
  ExternalLink,
  Github,
  Globe,
  KeyRound,
  Loader2,
  Smartphone,
  Sparkles,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { useRunStream } from "@/hooks/use-run-stream";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/api";

type DialogProps = { open: boolean; onOpenChange: (open: boolean) => void; projectId: string };

function copy(text: string) {
  void navigator.clipboard.writeText(text).then(() => toast.success("Copied"));
}

// --- Share ---------------------------------------------------------------------------------

export function ShareDialog({
  open,
  onOpenChange,
  projectId,
  canManage,
}: DialogProps & { canManage: boolean }) {
  const [members, setMembers] = useState<Array<{ email: string; role: string }>>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("editor");
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const load = () =>
    api<{ members: typeof members }>(`/api/projects/${projectId}/members`, { quiet: true })
      .then((r) => setMembers(r.members))
      .catch(() => {});
  useEffect(() => {
    if (open) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const invite = async () => {
    await api(`/api/projects/${projectId}/members`, { method: "POST", json: { email, role } });
    toast.success(`Shared with ${email}`);
    setEmail("");
    void load();
  };
  const createLink = async () => {
    const { url } = await api<{ url: string }>(`/api/projects/${projectId}/invites`, {
      method: "POST",
      json: { role },
    });
    setInviteUrl(url);
    copy(url);
  };
  const link = typeof window !== "undefined" ? `${location.origin}/projects/${projectId}` : "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>
            Invite by email (they sign in with that address), or send an invite link: it works once,
            for a week, for whoever opens it.
          </DialogDescription>
        </DialogHeader>
        {canManage ? (
          <div className="flex gap-2">
            <Input
              placeholder="name@example.com"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-label="Email to invite"
            />
            <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
              <SelectTrigger className="w-28" aria-label="Role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="editor">Can edit</SelectItem>
                <SelectItem value="viewer">Can view</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={invite} disabled={!email.includes("@")}>
              Invite
            </Button>
          </div>
        ) : null}
        {canManage ? (
          <div className="space-y-2">
            <Button variant="outline" size="sm" onClick={createLink} data-testid="create-invite">
              <Copy /> Create invite link ({role === "editor" ? "can edit" : "can view"})
            </Button>
            {inviteUrl ? (
              <div
                className="truncate rounded-lg bg-muted px-3 py-2 font-mono text-xs"
                data-testid="invite-url"
              >
                {inviteUrl}
              </div>
            ) : null}
          </div>
        ) : null}
        <ul className="space-y-2 text-sm" data-testid="member-list">
          {members.map((m) => (
            <li key={m.email} className="flex items-center gap-2">
              <span className="flex-1 truncate">{m.email}</span>
              <Badge variant="outline">{m.role === "editor" ? "Can edit" : "Can view"}</Badge>
              {canManage ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-7"
                  aria-label={`Remove ${m.email}`}
                  onClick={() =>
                    api(`/api/projects/${projectId}/members?email=${encodeURIComponent(m.email)}`, {
                      method: "DELETE",
                    }).then(load)
                  }
                >
                  <Trash2 />
                </Button>
              ) : null}
            </li>
          ))}
          {members.length === 0 ? (
            <li className="text-muted-foreground">Only you have access.</li>
          ) : null}
        </ul>
        <div className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-xs">
          <span className="flex-1 truncate font-mono">{link}</span>
          <Button size="sm" variant="ghost" className="h-7" onClick={() => copy(link)}>
            <Copy /> Copy link
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Export --------------------------------------------------------------------------------

interface Me {
  plan: "free" | "builder" | "pro";
  limits: { nativeBuilds: boolean };
  integrations: Array<{ provider: "github" | "expo"; label: string | null }>;
}

function RunStatus({
  runId,
  render,
}: {
  runId: string;
  render: (output: Record<string, unknown>) => React.ReactNode;
}) {
  const [output, setOutput] = useState<Record<string, unknown> | null>(null);
  const progress = useRunStream(runId, async (p) => {
    if (p.status !== "done") return;
    const runs = await api<{ runs: Array<{ id: string; output: Record<string, unknown> }> }>(
      `/api/projects/${location.pathname.split("/")[2]}/runs`,
      { quiet: true },
    );
    setOutput(runs.runs.find((r) => r.id === runId)?.output ?? {});
  });
  if (!progress || progress.status === "running") {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> {progress?.step ?? "Queued…"}
      </p>
    );
  }
  if (progress.status !== "done")
    return <p className="text-sm text-destructive">{progress.error}</p>;
  return output ? <div className="text-sm">{render(output)}</div> : null;
}

export function ExportDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
  onAskAI,
}: DialogProps & {
  projectName: string;
  /** Send a change request to the chat agent (the App Review check's "Fix with AI"). */
  onAskAI?: (request: string) => void;
}) {
  const [me, setMe] = useState<Me | null>(null);
  const [mode, setMode] = useState<"create" | "existing">("create");
  const [repo, setRepo] = useState("");
  const [owner, setOwner] = useState("");
  const [isPrivate, setPrivate] = useState(true);
  const [pushRun, setPushRun] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"android" | "ios">("android");
  const [profile, setProfile] = useState<"preview" | "production">("preview");
  const [buildRun, setBuildRun] = useState<string | null>(null);

  const defaultRepo = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const repoName = repo || defaultRepo;
  useEffect(() => {
    if (open)
      api<Me>("/api/me", { quiet: true })
        .then(setMe)
        .catch(() => {});
  }, [open]);

  const github = me?.integrations.find((i) => i.provider === "github");
  const expo = me?.integrations.find((i) => i.provider === "expo");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Export</DialogTitle>
          <DialogDescription>
            Take the source with you, push it to GitHub, or build installable apps.
          </DialogDescription>
        </DialogHeader>

        <section className="space-y-2">
          <h3 className="text-sm font-medium">Download</h3>
          <Button asChild variant="outline" className="w-full justify-start">
            <a href={`/api/projects/${projectId}/export`} data-testid="download-zip">
              <Download /> Download source (.zip)
            </a>
          </Button>
          <p className="text-xs text-muted-foreground">
            An Expo project with a README: run <code>npm install</code> then{" "}
            <code>npx expo start</code>.
          </p>
        </section>

        <section className="space-y-2 border-t pt-4">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Github className="size-4" /> GitHub
          </h3>
          {!github ? (
            <p className="text-sm text-muted-foreground">
              <Link href="/settings#integrations" className="underline">
                Connect GitHub in Settings
              </Link>{" "}
              to push this project to a repository.
            </p>
          ) : pushRun ? (
            <RunStatus
              runId={pushRun}
              render={(o) => (
                <span className="flex flex-col gap-1">
                  <a
                    className="inline-flex items-center gap-1 underline"
                    href={String(o.repoUrl)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    {String(o.repoUrl)} <ExternalLink className="size-3" />
                  </a>
                  {o.pullRequestUrl ? (
                    <a
                      className="inline-flex items-center gap-1 underline"
                      href={String(o.pullRequestUrl)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Review the pull request <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </span>
              )}
            />
          ) : (
            <div className="grid gap-2">
              <Select value={mode} onValueChange={(v) => setMode(v as typeof mode)}>
                <SelectTrigger aria-label="Repository">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="create">Create a new repository</SelectItem>
                  <SelectItem value="existing">
                    Push to an existing repository (opens a pull request)
                  </SelectItem>
                </SelectContent>
              </Select>
              <div className="flex gap-2">
                {mode === "existing" ? (
                  <Input
                    placeholder="owner"
                    value={owner}
                    onChange={(e) => setOwner(e.target.value)}
                    aria-label="Owner"
                  />
                ) : null}
                <Input
                  placeholder="repository"
                  value={repoName}
                  onChange={(e) => setRepo(e.target.value)}
                  aria-label="Repository name"
                />
              </div>
              {mode === "create" ? (
                <label className="flex items-center gap-2 text-sm">
                  <Switch checked={isPrivate} onCheckedChange={setPrivate} /> Private repository
                </label>
              ) : null}
              <Button
                onClick={async () => {
                  const r = await api<{ runId: string }>(`/api/projects/${projectId}/github`, {
                    method: "POST",
                    json: { repo: repoName, owner, create: mode === "create", private: isPrivate },
                  });
                  setPushRun(r.runId);
                }}
                disabled={!repoName || (mode === "existing" && !owner)}
              >
                <Github /> Push to GitHub
              </Button>
              <p className="text-xs text-muted-foreground">Connected as {github.label}.</p>
            </div>
          )}
        </section>

        <section className="space-y-2 border-t pt-4">
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <Smartphone className="size-4" /> Android & iOS builds{" "}
            <Badge variant="outline">Pro</Badge>
          </h3>
          {!me?.limits.nativeBuilds ? (
            <p className="text-sm text-muted-foreground">
              Installable APK, AAB and IPA builds are part of the{" "}
              <Link href="/pricing" className="underline">
                paid plans
              </Link>
              .
            </p>
          ) : !expo ? (
            <p className="text-sm text-muted-foreground">
              <Link href="/settings#integrations" className="underline">
                Add your Expo access token
              </Link>{" "}
              to build with EAS on your Expo account.
            </p>
          ) : buildRun ? (
            <RunStatus
              runId={buildRun}
              render={(o) =>
                o.detailsUrl ? (
                  <a
                    className="inline-flex items-center gap-1 underline"
                    href={String(o.detailsUrl)}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Follow the build on expo.dev <ExternalLink className="size-3" />
                  </a>
                ) : (
                  "Build submitted."
                )
              }
            />
          ) : (
            <div className="flex gap-2">
              <Select value={platform} onValueChange={(v) => setPlatform(v as typeof platform)}>
                <SelectTrigger className="w-32" aria-label="Platform">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="android">Android</SelectItem>
                  <SelectItem value="ios">iOS</SelectItem>
                </SelectContent>
              </Select>
              <Select value={profile} onValueChange={(v) => setProfile(v as typeof profile)}>
                <SelectTrigger className="flex-1" aria-label="Build type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="preview">
                    {platform === "android" ? "APK for testing" : "Internal test build"}
                  </SelectItem>
                  <SelectItem value="production">
                    {platform === "android" ? "AAB for Google Play" : "IPA for the App Store"}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={async () => {
                  const r = await api<{ runId: string }>(
                    `/api/projects/${projectId}/native-build`,
                    { method: "POST", json: { platform, profile } },
                  );
                  setBuildRun(r.runId);
                }}
              >
                Build
              </Button>
            </div>
          )}
          {platform === "ios" && me?.limits.nativeBuilds ? (
            <p className="text-xs text-muted-foreground">
              iOS device builds need an Apple Developer account connected to your Expo account.
            </p>
          ) : null}
        </section>

        {me?.limits.nativeBuilds && expo ? (
          <StoreSubmit projectId={projectId} onAskAI={onAskAI} />
        ) : null}

        <SupportChat projectId={projectId} />
      </DialogContent>
    </Dialog>
  );
}

// --- Publish -------------------------------------------------------------------------------

export function PublishDialog({
  open,
  onOpenChange,
  projectId,
  slug,
  visibility,
  onChanged,
}: DialogProps & { slug: string | null; visibility: "private" | "public"; onChanged: () => void }) {
  const [busy, setBusy] = useState(false);
  const url = slug && typeof window !== "undefined" ? `${location.origin}/p/${slug}` : null;
  const publish = async () => {
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/publish`, { method: "POST" });
      toast.success(slug ? "Published the latest version" : "Your app is live");
      onChanged();
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Publish to the web</DialogTitle>
          <DialogDescription>
            Anyone with the link can use the app in their browser. Publishing again updates it to
            your latest version.
          </DialogDescription>
        </DialogHeader>
        {url ? (
          <div
            className="flex items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm"
            data-testid="publish-url"
          >
            <Globe className="size-4 shrink-0" />
            <a href={url} target="_blank" rel="noreferrer" className="flex-1 truncate underline">
              {url}
            </a>
            <Button size="sm" variant="ghost" className="h-7" onClick={() => copy(url)}>
              <Copy />
            </Button>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button onClick={publish} disabled={busy} data-testid="publish-button">
            {busy ? <Loader2 className="animate-spin" /> : <Check />}{" "}
            {slug ? "Update published app" : "Publish"}
          </Button>
          {slug ? (
            <Button
              variant="outline"
              onClick={async () => {
                await api(`/api/projects/${projectId}/publish`, { method: "DELETE" });
                toast.success("Unpublished");
                onChanged();
              }}
            >
              Unpublish
            </Button>
          ) : null}
        </div>
        <label className="flex items-center justify-between gap-3 border-t pt-4 text-sm">
          <span>
            Show in the community gallery
            <span className="block text-xs text-muted-foreground">
              Others can try it and remix a copy. Your chat stays private.
            </span>
          </span>
          <Switch
            checked={visibility === "public"}
            onCheckedChange={async (checked) => {
              await api(`/api/projects/${projectId}`, {
                method: "PATCH",
                json: { visibility: checked ? "public" : "private" },
              });
              onChanged();
            }}
            aria-label="Show in community"
          />
        </label>
      </DialogContent>
    </Dialog>
  );
}

// --- Device preview ------------------------------------------------------------------------

interface DeviceSession {
  status: "starting" | "running" | "stopped" | "error";
  url: string | null;
  error: string | null;
}

interface DeviceState {
  session: DeviceSession | null;
  /** False when no worker on this server runs phone previews. */
  available: boolean;
  /** The viewer's connected Expo account (Settings), which Expo Go on iPhone must match. */
  expoAccount?: string | null;
}

const EXPO_TOKENS_URL = "https://expo.dev/settings/access-tokens";

/**
 * Connect the viewer's Expo account from the phone dialog: on a physical iPhone, Expo Go only
 * opens a dev server signed in as the phone's own Expo account (Android doesn't check).
 */
function ConnectExpo({
  replacing,
  onConnected,
}: {
  replacing: boolean;
  onConnected: (account: string) => void;
}) {
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <div className="w-full rounded-lg border p-3 text-sm" data-testid="connect-expo">
      <p className="font-medium">
        {replacing
          ? "Connect a different Expo account"
          : "Using an iPhone? Connect your Expo account"}
      </p>
      <p className="mt-1 text-xs text-muted-foreground">
        Expo Go on iPhone only opens previews from your own Expo account. Android works without
        this.
      </p>
      <ol className="mt-3 list-decimal space-y-2 pl-4 text-xs">
        <li>
          <a
            href={EXPO_TOKENS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium underline"
          >
            Create a token on expo.dev <ExternalLink className="size-3" />
          </a>
          <span className="text-muted-foreground">
            {" "}
            (sign in, choose Create token, and copy it). Use a personal token, not a robot one.
          </span>
        </li>
        <li>
          Paste it here:
          <form
            className="mt-1.5 flex gap-2"
            onSubmit={async (event) => {
              event.preventDefault();
              setBusy(true);
              try {
                const { label } = await api<{ label: string }>("/api/integrations/expo", {
                  method: "PUT",
                  json: { token: token.trim() },
                });
                setToken("");
                onConnected(label);
              } catch {
                // api() already showed why (for example, Expo rejected the token).
              } finally {
                setBusy(false);
              }
            }}
          >
            <Input
              type="password"
              autoComplete="off"
              placeholder="Expo access token"
              aria-label="Expo access token"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              className="h-8 text-xs"
              data-testid="expo-token-input"
            />
            <Button
              type="submit"
              size="sm"
              disabled={busy || token.trim().length < 10}
              data-testid="expo-connect"
            >
              {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Connect
            </Button>
          </form>
        </li>
        <li>In Expo Go, sign in with the same account, then scan the code.</li>
      </ol>
    </div>
  );
}

export function DeviceDialog({ open, onOpenChange, projectId }: DialogProps) {
  const [session, setSession] = useState<DeviceSession | null>(null);
  const [available, setAvailable] = useState(true);
  const [expoAccount, setExpoAccount] = useState<string | null | undefined>(undefined);
  const [changingAccount, setChangingAccount] = useState(false);
  const [qrCode, setQrCode] = useState<{ url: string; data: string } | null>(null);

  async function connected(account: string) {
    setExpoAccount(account);
    setChangingAccount(false);
    toast.success(`Connected to Expo as ${account}`);
    // Restart the dev server so it runs signed in as this account.
    const state = await api<DeviceState>(`/api/projects/${projectId}/device`, {
      method: "POST",
      json: { restart: true },
    }).catch(() => null);
    if (state) setSession(state.session);
  }

  useEffect(() => {
    if (!open) return;
    let alive = true;
    let timer: ReturnType<typeof setInterval> | undefined;
    const show = (state: DeviceState) => {
      if (!alive) return;
      setSession(state.session);
      setAvailable(state.available);
      setExpoAccount(state.expoAccount);
    };
    api<DeviceState>(`/api/projects/${projectId}/device`, { method: "POST" })
      .then((state) => {
        show(state);
        if (!state.available || !alive) return;
        timer = setInterval(() => {
          api<DeviceState>(`/api/projects/${projectId}/device`, { quiet: true })
            .then(show)
            .catch(() => {});
        }, 2000);
      })
      .catch(() => {});
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [open, projectId]);

  useEffect(() => {
    const url = session?.url;
    if (url)
      void QRCode.toDataURL(url, { margin: 1, width: 240 }).then((data) =>
        setQrCode({ url, data }),
      );
  }, [session?.url]);
  const qr = session?.url && qrCode?.url === session.url ? qrCode.data : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Open on your phone</DialogTitle>
          <DialogDescription>
            Scan with your camera (iOS) or the Expo Go app (Android). Changes you make appear on the
            phone automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-3 py-2" data-testid="device-dialog">
          {!available ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              Phone previews aren&apos;t turned on for this server. You can still run the app on
              your phone: download the source from Export, then run{" "}
              <code className="text-xs">npx expo start</code> and scan its QR code.
            </p>
          ) : session?.status === "running" && qr ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt="QR code to open the app in Expo Go"
                className="size-60 rounded-lg border"
              />
              <code className="max-w-full text-center text-xs break-all select-all">
                {session.url}
              </code>
              {session.error ? (
                <p className="text-center text-xs text-destructive">{session.error}</p>
              ) : null}
            </>
          ) : session?.status === "error" ? (
            <p className="text-sm text-destructive">{session.error ?? "The dev server stopped."}</p>
          ) : (
            <p className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Starting a dev server for your app…
            </p>
          )}
          {available && session?.status === "starting" && (
            <p className="text-center text-xs text-muted-foreground">
              The first start on a server installs the Expo SDK and can take a few minutes.
            </p>
          )}
          {available &&
          (session?.status === "running" || session?.status === "starting") &&
          expoAccount !== undefined ? (
            expoAccount === null || changingAccount || session.error ? (
              <ConnectExpo
                replacing={expoAccount !== null}
                onConnected={(account) => void connected(account)}
              />
            ) : (
              <p className="text-center text-xs text-muted-foreground" data-testid="expo-account">
                {expoAccount === "Expo access token" ? (
                  "On iPhone, sign in to Expo Go with the account your Expo token belongs to."
                ) : (
                  <>
                    On iPhone, sign in to Expo Go as <strong>{expoAccount}</strong>.
                  </>
                )}{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => setChangingAccount(true)}
                >
                  Use a different account
                </button>
              </p>
            )
          ) : null}
          <p className="text-center text-xs text-muted-foreground">
            {session?.url?.startsWith("exps://")
              ? "Needs the Expo Go app (SDK 58). Works on any network."
              : "Needs Expo Go for SDK 58 and a network that can reach this server."}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// --- Send to the stores ------------------------------------------------------------------

interface StoreState {
  settings: { ios: string; android: string; ascAppId: string };
  keys: { expo: boolean; appStore: boolean; play: boolean };
}

/** One click from the latest version to TestFlight or Google Play's internal testing. */
interface SupportChatState {
  appId: string;
  connected: boolean;
  /** Paid plans include the chat on this server (Hire Shelby's partner API is set up). */
  partner: boolean;
  included: boolean;
  enabled: boolean;
  /** The App ID is the one App Builder created (not the owner's own account). */
  managed: boolean;
  ai: { replies: number; credits: number };
}

/**
 * Hire Shelby (our in-app support chat). Included on paid plans: on for every app by default,
 * with a switch, and the owner answers in Hire Shelby's inbox; its AI replies cost credits.
 * Anyone can instead paste the App ID of a Hire Shelby account they pay for themselves.
 */
function SupportChat({ projectId }: { projectId: string }) {
  const [state, setState] = useState<SupportChatState | null>(null);
  const [appId, setAppId] = useState("");
  const [saving, setSaving] = useState(false);
  const [own, setOwn] = useState(false);
  const load = useCallback(
    () =>
      api<SupportChatState>(`/api/projects/${projectId}/support-chat`, { quiet: true })
        .then((s) => {
          setState(s);
          setAppId(s.managed ? "" : s.appId);
          setOwn(Boolean(s.appId) && !s.managed);
        })
        .catch(() => {}),
    [projectId],
  );
  useEffect(() => {
    void load();
  }, [load]);
  if (!state) return null;
  const put = async (json: { appId: string } | { enabled: boolean }, done: string) => {
    setSaving(true);
    try {
      await api(`/api/projects/${projectId}/support-chat`, { method: "PUT", json });
      toast.success(done);
      await load();
    } catch {
      // api() showed why.
    } finally {
      setSaving(false);
    }
  };
  const openInbox = async () => {
    const tab = window.open("", "_blank");
    try {
      const { url } = await api<{ url: string }>("/api/support-chat/inbox", { method: "POST" });
      if (tab) tab.location.href = url;
      else window.location.href = url;
    } catch {
      tab?.close();
    }
  };
  const includedOn = state.included && state.enabled && state.managed;
  return (
    <section className="space-y-2 border-t pt-4" data-testid="support-chat">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        In-app support chat{" "}
        {state.connected ? (
          <Badge variant="outline">{state.managed ? "On" : "Your Hire Shelby app"}</Badge>
        ) : null}
      </h3>
      <p className="text-xs text-muted-foreground">
        Help &amp; support in the app opens a native chat with you, powered by{" "}
        <a className="underline" href="https://hireshelby.com" target="_blank" rel="noreferrer">
          Hire Shelby
        </a>
        : your users write from inside the app, you answer from the inbox, Telegram or its AI. It
        runs in iOS builds (TestFlight and the App Store); the preview, Expo Go and Android email
        your support address instead.
      </p>

      {state.partner ? (
        state.included ? (
          <div className="space-y-2 rounded-lg border p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">
                {includedOn ? "On for this app" : "Off for this app"}
                <span className="block text-xs text-muted-foreground">
                  Included in your plan. AI replies use credits
                  {state.ai.replies
                    ? ` (this month: ${state.ai.replies} replies, ${state.ai.credits} credits)`
                    : ", usually a fifth of a credit or less each"}
                  .
                </span>
              </span>
              <Switch
                checked={includedOn}
                disabled={saving || own}
                onCheckedChange={(on) =>
                  put({ enabled: on }, on ? "Support chat on" : "Help & support switched to email")
                }
                aria-label="Support chat for this app"
                data-testid="support-chat-switch"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => void openInbox()}
              data-testid="support-chat-inbox"
            >
              <ExternalLink /> Open support inbox
            </Button>
          </div>
        ) : (
          <p className="rounded-lg border p-3 text-xs" data-testid="support-chat-upgrade">
            Included on{" "}
            <Link href="/pricing" className="underline">
              Builder and Pro
            </Link>
            : every app gets the chat, and you answer from one inbox.
          </p>
        )
      ) : null}

      {state.partner && !own ? (
        <button
          type="button"
          className="text-xs text-muted-foreground underline underline-offset-2"
          onClick={() => setOwn(true)}
        >
          Use your own Hire Shelby account instead
        </button>
      ) : (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {state.partner
              ? "Your own Hire Shelby account: add the app there and paste its App ID."
              : "Add the app in Hire Shelby's dashboard, then paste its App ID."}
          </p>
          <div className="flex gap-2">
            <Input
              value={appId}
              onChange={(e) => setAppId(e.target.value)}
              aria-label="Hire Shelby App ID"
              placeholder="app_…"
              className="font-mono text-xs"
            />
            <Button
              size="sm"
              onClick={() => put({ appId: appId.trim() }, "Support chat connected")}
              disabled={saving || !appId.trim() || appId.trim() === state.appId}
              data-testid="support-chat-save"
            >
              {saving ? <Loader2 className="animate-spin" /> : null} Connect
            </Button>
            {state.connected && !state.managed ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => put({ appId: "" }, "Support chat disconnected")}
                disabled={saving}
              >
                Disconnect
              </Button>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

interface ReviewItemView {
  id: string;
  title: string;
  status: "pass" | "warn" | "fail";
  detail: string;
  guideline: string;
  fix?: string;
}

/**
 * The App Review check: what the stores reject apps for, checked on the current version before
 * it's sent. Failures block nothing (TestFlight and internal testing aren't reviewed), but they
 * are what to fix before submitting for review.
 */
function ReviewCheck({
  projectId,
  platform,
  onAskAI,
}: {
  projectId: string;
  platform: "ios" | "android";
  onAskAI?: (request: string) => void;
}) {
  const [report, setReport] = useState<{ ready: boolean; items: ReviewItemView[] } | null>(null);
  useEffect(() => {
    api<{ ready: boolean; items: ReviewItemView[] }>(
      `/api/projects/${projectId}/review-check?platform=${platform}`,
      { quiet: true },
    )
      .then(setReport)
      .catch(() => setReport(null));
  }, [projectId, platform]);
  if (!report) return null;
  const failing = report.items.filter((i) => i.status === "fail");
  const warning = report.items.filter((i) => i.status === "warn");
  const fixes = [...failing, ...warning].filter((i) => i.fix).map((i) => i.fix!);
  return (
    <div className="space-y-2 rounded-lg border p-3" data-testid="review-check">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium">
          {report.ready
            ? warning.length
              ? `Ready for App Review, with ${warning.length} thing${warning.length === 1 ? "" : "s"} to consider`
              : "Ready for App Review"
            : `${failing.length} thing${failing.length === 1 ? "" : "s"} App Review would reject`}
        </p>
        {onAskAI && fixes.length ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              onAskAI(`Get the app ready for App Review:\n${fixes.map((f) => `- ${f}`).join("\n")}`)
            }
            data-testid="review-fix-all"
          >
            <Sparkles /> Fix with AI
          </Button>
        ) : null}
      </div>
      <ul className="space-y-1.5">
        {[...failing, ...warning, ...report.items.filter((i) => i.status === "pass")].map((i) => (
          <li key={i.id} className="flex gap-2 text-xs" data-testid={`review-${i.id}`}>
            {i.status === "pass" ? (
              <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
            ) : i.status === "warn" ? (
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
            ) : (
              <CircleX className="mt-0.5 size-3.5 shrink-0 text-destructive" />
            )}
            <span className="min-w-0">
              <span className="font-medium">{i.title}</span>
              {i.status !== "pass" ? (
                <span className="block text-muted-foreground">
                  {i.detail} <span className="opacity-70">({i.guideline})</span>
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StoreSubmit({
  projectId,
  onAskAI,
}: {
  projectId: string;
  onAskAI?: (request: string) => void;
}) {
  const [checkPlatform, setCheckPlatform] = useState<"ios" | "android">("ios");
  const [state, setState] = useState<StoreState | null>(null);
  const [settings, setSettings] = useState({ ios: "", android: "", ascAppId: "" });
  const [saving, setSaving] = useState(false);
  const [run, setRun] = useState<{ id: string; platform: "ios" | "android" } | null>(null);
  useEffect(() => {
    api<StoreState>(`/api/projects/${projectId}/store`, { quiet: true })
      .then((s) => {
        setState(s);
        setSettings(s.settings);
      })
      .catch(() => {});
  }, [projectId]);
  if (!state) return null;
  const changed =
    settings.ios !== state.settings.ios ||
    settings.android !== state.settings.android ||
    settings.ascAppId !== state.settings.ascAppId;

  const saveSettings = async () => {
    setSaving(true);
    try {
      const r = await api<{ settings: StoreState["settings"] }>(
        `/api/projects/${projectId}/store`,
        {
          method: "PUT",
          json: settings,
        },
      );
      setState({ ...state, settings: r.settings });
      toast.success("Store settings saved");
    } catch {
      // api() showed why.
    } finally {
      setSaving(false);
    }
  };
  const send = async (platform: "ios" | "android") => {
    const r = await api<{ runId: string }>(`/api/projects/${projectId}/native-build`, {
      method: "POST",
      json: { platform, profile: "production", submit: true },
    });
    setRun({ id: r.runId, platform });
  };

  return (
    <section className="space-y-3 border-t pt-4" data-testid="store-submit">
      <h3 className="text-sm font-medium">Send to the stores</h3>
      <p className="text-xs text-muted-foreground">
        A production build that goes to TestFlight, or to Google Play&rsquo;s internal testing (as a
        draft release), by itself. Create the app in App Store Connect and Play Console first, with
        these identifiers.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <Input
          value={settings.ios}
          onChange={(e) => setSettings({ ...settings, ios: e.target.value })}
          aria-label="iOS bundle ID"
          placeholder="iOS bundle ID"
          className="font-mono text-xs"
        />
        <Input
          value={settings.android}
          onChange={(e) => setSettings({ ...settings, android: e.target.value })}
          aria-label="Android package"
          placeholder="Android package"
          className="font-mono text-xs"
        />
        <Input
          value={settings.ascAppId}
          onChange={(e) => setSettings({ ...settings, ascAppId: e.target.value })}
          aria-label="App Store Connect app ID"
          placeholder="App Store Connect app ID (App Information → Apple ID)"
          className="col-span-2 text-xs"
        />
      </div>
      {changed ? (
        <Button size="sm" variant="outline" onClick={saveSettings} disabled={saving}>
          {saving ? <Loader2 className="animate-spin" /> : null} Save store settings
        </Button>
      ) : null}
      {run ? (
        <RunStatus
          runId={run.id}
          render={(o) => (
            <span>
              {run.platform === "ios"
                ? "Building; it goes to TestFlight when the build finishes (Apple then processes it for a few minutes)."
                : "Building; it goes to Google Play internal testing as a draft when the build finishes. Roll it out to your testers in Play Console."}{" "}
              {o.detailsUrl ? (
                <a
                  className="underline"
                  href={String(o.detailsUrl)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Follow it on expo.dev
                </a>
              ) : null}
            </span>
          )}
        />
      ) : (
        <div className="flex flex-wrap gap-2">
          <Select
            value={checkPlatform}
            onValueChange={(v) => setCheckPlatform(v as typeof checkPlatform)}
          >
            <SelectTrigger className="h-8 w-40" aria-label="Check for">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ios">Check for iOS</SelectItem>
              <SelectItem value="android">Check for Android</SelectItem>
            </SelectContent>
          </Select>
          <Button
            size="sm"
            onClick={() => send("ios")}
            disabled={!state.keys.appStore || !state.settings.ascAppId || changed}
            data-testid="send-testflight"
          >
            Send to TestFlight
          </Button>
          <Button
            size="sm"
            onClick={() => send("android")}
            disabled={!state.keys.play || changed}
            data-testid="send-play"
          >
            Send to Google Play
          </Button>
        </div>
      )}
      <ReviewCheck projectId={projectId} platform={checkPlatform} onAskAI={onAskAI} />
      {!state.keys.appStore || !state.keys.play ? (
        <p className="text-xs text-muted-foreground">
          {!state.keys.appStore ? "TestFlight needs your App Store Connect API key" : ""}
          {!state.keys.appStore && !state.keys.play ? "; " : ""}
          {!state.keys.play ? "Google Play needs a service account key" : ""}:{" "}
          <Link href="/settings#integrations" className="underline">
            add them in Settings
          </Link>
          .
        </p>
      ) : null}
    </section>
  );
}
