"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { CircleCheck, CircleX, Loader2, Plus, Search, Sparkles } from "lucide-react";
import { AppShell, PanelSection, SidebarHeader } from "@/components/shell/app-shell";
import type { RailUser } from "@/components/shell/left-rail";
import { PromptBox, type PromptSubmission } from "@/components/prompt-box";
import { ProjectCard, type ProjectCardData } from "@/components/project-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api";
import { authClient } from "@/lib/auth-client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/time-ago";

export interface DashboardData {
  user: RailUser;
  projects: ProjectCardData[];
  community: ProjectCardData[];
  credits: number;
  plan: "free" | "builder" | "pro";
  limits: { name: string; maxProjects: number | null; maxScreensPerProject: number };
  /** A prompt typed on the landing page before signing up. */
  pendingPrompt: string;
  emailVerified: boolean;
}

interface ActivityItem {
  id: string;
  kind: string;
  status: string;
  createdAt: string;
  projectId: string;
  projectName: string;
}

const COLORS = [
  "bg-emerald-500",
  "bg-sky-500",
  "bg-violet-500",
  "bg-amber-500",
  "bg-rose-500",
  "bg-teal-500",
];

function dotColor(id: string) {
  let hash = 0;
  for (const c of id) hash = (hash * 31 + c.charCodeAt(0)) | 0;
  return COLORS[Math.abs(hash) % COLORS.length];
}

export function Dashboard({ initial }: { initial: DashboardData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [tab, setTab] = useState<"create" | "mine" | "shared" | "community">("create");
  const [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  const refresh = useCallback(async () => {
    const [projects, me] = await Promise.all([
      api<{ projects: ProjectCardData[] }>("/api/projects", { quiet: true }),
      api<{ credits: number }>("/api/me", { quiet: true }),
    ]);
    setData((d) => ({ ...d, projects: projects.projects, credits: me.credits }));
  }, []);

  useEffect(() => {
    api<{ activity: ActivityItem[] }>("/api/activity", { quiet: true })
      .then((r) => setActivity(r.activity))
      .catch(() => {});
  }, []);

  const own = data.projects.filter((p) => p.role === "owner");
  const shared = data.projects.filter((p) => p.role !== "owner");
  const visible = useMemo(
    () => data.projects.filter((p) => p.name.toLowerCase().includes(filter.toLowerCase())),
    [data.projects, filter],
  );

  const create = async ({ prompt, platforms, files }: PromptSubmission) => {
    setBusy(true);
    try {
      const form = new FormData();
      form.set("prompt", prompt);
      form.set("platforms", platforms);
      for (const file of files) form.append("files", file);
      const { id } = await api<{ id: string }>("/api/projects", { method: "POST", body: form });
      router.push(`/projects/${id}`);
    } catch {
      setBusy(false);
    }
  };

  const limitReached = data.limits.maxProjects !== null && own.length >= data.limits.maxProjects;
  const grid = (projects: ProjectCardData[], empty: string) =>
    projects.length === 0 ? (
      <p className="text-sm text-muted-foreground">{empty}</p>
    ) : (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="project-grid">
        {projects.map((p) => (
          <ProjectCard key={p.id} project={p} onChanged={refresh} />
        ))}
      </div>
    );

  return (
    <AppShell
      user={data.user}
      active="home"
      sidebar={
        <>
          <SidebarHeader>
            <span className="text-sm font-semibold">Projects</span>
            <span className="text-xs text-muted-foreground">{data.projects.length}</span>
            <Button
              size="icon"
              variant="ghost"
              className="ml-auto size-7"
              aria-label="New project"
              onClick={() => setTab("create")}
            >
              <Plus />
            </Button>
          </SidebarHeader>
          <div className="p-3">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
              <Input
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="Filter projects"
                className="h-9 pl-8"
              />
            </div>
          </div>
          <ul className="min-h-0 flex-1 overflow-auto px-2 pb-2" data-testid="project-list">
            {visible.map((p) => (
              <li key={p.id}>
                <Link
                  href={`/projects/${p.id}`}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white",
                      dotColor(p.id),
                    )}
                  >
                    {p.name.slice(0, 1).toUpperCase()}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{p.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      <TimeAgo date={p.updatedAt} />
                    </span>
                  </span>
                </Link>
              </li>
            ))}
            {visible.length === 0 ? (
              <li className="px-2 py-4 text-sm text-muted-foreground">No projects yet.</li>
            ) : null}
          </ul>
        </>
      }
      tabs={
        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList>
            <TabsTrigger value="create">Create</TabsTrigger>
            <TabsTrigger value="mine">My projects ({own.length})</TabsTrigger>
            <TabsTrigger value="shared">Shared with me ({shared.length})</TabsTrigger>
            <TabsTrigger value="community">Community</TabsTrigger>
          </TabsList>
        </Tabs>
      }
      aside={
        <>
          <PanelSection title="Credits">
            <div className="flex items-baseline gap-2">
              <span className="text-3xl font-semibold" data-testid="credit-balance">
                {data.credits}
              </span>
              <span className="text-sm text-muted-foreground">credits</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {data.limits.name} plan ·{" "}
              {data.limits.maxProjects === null
                ? "unlimited projects"
                : `${own.length}/${data.limits.maxProjects} projects`}{" "}
              · up to {data.limits.maxScreensPerProject} screens per app
            </p>
            {data.plan === "free" ? (
              <Button asChild size="sm" className="mt-3 w-full">
                <Link href="/pricing">Upgrade</Link>
              </Button>
            ) : null}
          </PanelSection>
          <PanelSection title="Activity">
            <ul className="space-y-2.5 text-sm">
              {activity.slice(0, 8).map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/projects/${a.projectId}`}
                    className="flex items-center gap-2 hover:underline"
                  >
                    {a.status === "succeeded" ? (
                      <CircleCheck className="size-4 shrink-0 text-emerald-600" />
                    ) : a.status === "failed" || a.status === "cancelled" ? (
                      <CircleX className="size-4 shrink-0 text-destructive" />
                    ) : (
                      <Loader2 className="size-4 shrink-0 animate-spin" />
                    )}
                    <span className="truncate">{a.projectName}</span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">{a.kind}</span>
                  </Link>
                </li>
              ))}
              {activity.length === 0 ? (
                <li className="text-muted-foreground">
                  Your plans, builds and edits show up here.
                </li>
              ) : null}
            </ul>
          </PanelSection>
          <PanelSection title="Tips">
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li className="flex gap-2">
                <Sparkles className="mt-0.5 size-4 shrink-0" /> Attach a screenshot you like and the
                agent will follow its style.
              </li>
              <li className="flex gap-2">
                <Sparkles className="mt-0.5 size-4 shrink-0" /> Review the plan before building: ask
                for more or fewer screens.
              </li>
              <li className="flex gap-2">
                <Sparkles className="mt-0.5 size-4 shrink-0" /> Click any element in the preview to
                edit it directly.
              </li>
            </ul>
          </PanelSection>
        </>
      }
      bottomLeft={
        <span>
          {data.limits.name} plan · {data.credits} credits
        </span>
      }
      bottomRight={<span>Expo SDK 58</span>}
    >
      <div className="mx-auto max-w-5xl p-6">
        {!data.emailVerified ? (
          <div
            className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300/60 bg-amber-50 px-4 py-2 text-sm text-amber-900 dark:bg-amber-950/30 dark:text-amber-200"
            data-testid="verify-banner"
          >
            Verify your email ({data.user.email}) to accept projects people share with you.
            <Button
              size="sm"
              variant="outline"
              className="ml-auto h-7"
              onClick={async () => {
                const result = await authClient.sendVerificationEmail({
                  email: data.user.email,
                  callbackURL: "/",
                });
                if (result.error) toast.error(result.error.message ?? "Couldn't send the email.");
                else toast.success("Verification email sent");
              }}
            >
              Resend email
            </Button>
          </div>
        ) : null}
        {tab === "create" ? (
          <>
            <div className="mx-auto max-w-2xl py-8 text-center">
              <h1 className="text-3xl font-semibold tracking-tight">
                What do you want to build, {data.user.name.split(" ")[0]}?
              </h1>
              <p className="mt-2 text-muted-foreground">
                Describe your app. The agent will propose a plan you can review before it builds.
              </p>
            </div>
            <div className="mx-auto max-w-2xl">
              {limitReached ? (
                <div className="rounded-xl border bg-muted/40 p-6 text-center text-sm">
                  The {data.limits.name} plan includes {data.limits.maxProjects} projects.{" "}
                  <Link href="/pricing" className="font-medium underline">
                    Upgrade to Pro
                  </Link>{" "}
                  for unlimited projects, or delete one.
                </div>
              ) : (
                <PromptBox
                  key={data.pendingPrompt}
                  onSubmit={create}
                  busy={busy}
                  initialPrompt={data.pendingPrompt}
                  autoFocus
                />
              )}
            </div>
            {own.length > 0 ? (
              <div className="mt-12">
                <h2 className="mb-3 text-sm font-semibold">Recent projects</h2>
                {grid(own.slice(0, 3), "")}
              </div>
            ) : null}
          </>
        ) : tab === "mine" ? (
          grid(own, "You haven't created a project yet.")
        ) : tab === "shared" ? (
          grid(shared, "Projects other people share with you appear here.")
        ) : (
          grid(data.community, "No public apps yet.")
        )}
      </div>
    </AppShell>
  );
}
