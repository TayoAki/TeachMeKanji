"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import QRCode from "qrcode";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Github,
  Globe,
  Loader2,
  Smartphone,
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
  const link = typeof window !== "undefined" ? `${location.origin}/projects/${projectId}` : "";
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Share project</DialogTitle>
          <DialogDescription>
            People you invite see this project when they sign in with that email.
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
  plan: "free" | "pro";
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
}: DialogProps & { projectName: string }) {
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
          {me?.plan !== "pro" ? (
            <p className="text-sm text-muted-foreground">
              Installable APK, AAB and IPA builds are part of{" "}
              <Link href="/pricing" className="underline">
                Pro
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
          {platform === "ios" && me?.plan === "pro" ? (
            <p className="text-xs text-muted-foreground">
              iOS device builds need an Apple Developer account connected to your Expo account.
            </p>
          ) : null}
        </section>
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

export function DeviceDialog({ open, onOpenChange, projectId }: DialogProps) {
  const [session, setSession] = useState<DeviceSession | null>(null);
  const [qrCode, setQrCode] = useState<{ url: string; data: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    api<{ session: DeviceSession }>(`/api/projects/${projectId}/device`, { method: "POST" })
      .then((r) => alive && setSession(r.session))
      .catch(() => {});
    const timer = setInterval(() => {
      api<{ session: DeviceSession | null }>(`/api/projects/${projectId}/device`, { quiet: true })
        .then((r) => alive && setSession(r.session))
        .catch(() => {});
    }, 2000);
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
          {session?.status === "running" && qr ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={qr}
                alt="QR code to open the app in Expo Go"
                className="size-60 rounded-lg border"
              />
              <code className="max-w-full truncate text-xs">{session.url}</code>
            </>
          ) : session?.status === "error" ? (
            <p className="text-sm text-destructive">{session.error ?? "The dev server stopped."}</p>
          ) : (
            <p className="flex items-center gap-2 py-16 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Starting a dev server for your app…
            </p>
          )}
          <p className="text-center text-xs text-muted-foreground">
            Needs Expo Go for SDK 58 and a network that can reach this server.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
