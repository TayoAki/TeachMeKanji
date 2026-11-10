"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft,
  Copy,
  Download,
  Loader2,
  Moon,
  MoreHorizontal,
  MousePointerClick,
  Pencil,
  RotateCw,
  Share2,
  Smartphone,
  Sparkles,
  Sun,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import {
  parseFid,
  type FrameToParent,
  type InlinePatch,
  type PreviewTheme,
  type ProjectFiles,
  type SelectedElement,
} from "@appbuilder/contract/protocol";
import { useRunStream } from "@/hooks/use-run-stream";
import { AppShell, PanelSection, SidebarHeader } from "@/components/shell/app-shell";
import type { RailUser } from "@/components/shell/left-rail";
import { PreviewFrame } from "@/components/preview/preview-frame";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api, ApiError } from "@/lib/api";
import { Canvas } from "./canvas";
import { ChatPanel, type ChatSelection } from "./chat-panel";
import { AppCloudPanel, DataView } from "./app-cloud";
import { CodeView, HistoryView } from "./code-and-history";
import { DeviceDialog, ExportDialog, PublishDialog, ShareDialog } from "./dialogs";
import { Inspector, ThemeList } from "./inspector";
import type { ProjectState } from "./types";

const STATUS_LABEL: Record<ProjectState["project"]["status"], string> = {
  draft: "Draft",
  planning: "Planning",
  awaiting_confirmation: "Plan ready",
  building: "Building",
  ready: "Ready",
  error: "Needs attention",
};

export function Workspace({ initial, user }: { initial: ProjectState; user: RailUser | null }) {
  const router = useRouter();
  const [state, setState] = useState(initial);
  const [runId, setRunId] = useState<string | null>(initial.activeRun?.id ?? null);
  const [tab, setTab] = useState<"canvas" | "code" | "data" | "history">("canvas");
  const [chosenThemeId, setThemeId] = useState<string | undefined>(undefined);
  const [themes, setThemes] = useState<PreviewTheme[]>([]);
  // Preview the app in light or night mode (null: the picked theme as it is).
  const [appAppearance, setAppAppearance] = useState<"light" | "dark" | null>(null);
  const [canSwitchAppearance, setCanSwitchAppearance] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<SelectedElement | null>(null);
  const [chatSelection, setChatSelection] = useState<ChatSelection | null>(null);
  const [appHref, setAppHref] = useState("/");
  const [appKey, setAppKey] = useState(0);
  const [dialog, setDialog] = useState<null | "share" | "export" | "publish" | "device">(null);
  const [codeFocus, setCodeFocus] = useState<string | null>(null);

  const { project, access } = state;
  const canEdit = access === "owner" || access === "editor";
  const canManage = access === "owner";
  const seeSource = access !== "public";

  const refresh = useCallback(async () => {
    const next = await api<ProjectState>(`/api/projects/${project.id}`, { quiet: true });
    setState(next);
    return next;
  }, [project.id]);

  // Changes can come from outside this tab (an AI assistant over MCP, another editor): poll the
  // current version while idle and reload when it moves.
  useEffect(() => {
    if (runId) return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== "visible") return;
      const head = await api<{ versionId: string | null }>(`/api/projects/${project.id}/head`, {
        quiet: true,
      }).catch(() => null);
      if (head && head.versionId !== state.versionId) void refresh();
    }, 4000);
    return () => clearInterval(timer);
  }, [project.id, runId, state.versionId, refresh]);

  // With App Cloud, every preview frame acts as the project's stable preview user.
  const [previewToken, setPreviewToken] = useState<{ token: string } | null>(null);
  useEffect(() => {
    if (
      state.project.backend !== "cloud" ||
      !(state.access === "owner" || state.access === "editor")
    )
      return;
    let alive = true;
    api<{ token: string | null }>(`/api/projects/${state.project.id}/preview-token`, {
      method: "POST",
      quiet: true,
    })
      .then((r) => alive && r.token && setPreviewToken({ token: r.token }))
      .catch(() => {});
    return () => {
      alive = false;
    };
    // Once per App Cloud switch: a new token reloads every preview frame.
  }, [state.project.backend, state.project.id, state.access]);
  const token = state.project.backend === "cloud" ? previewToken?.token : undefined;
  const previewStorage = useMemo(() => (token ? { "app:auth:token": token } : undefined), [token]);

  const progress = useRunStream(runId, () => {
    setRunId(null);
    void refresh();
  });

  const themeId = chosenThemeId ?? state.project.activeThemeId ?? undefined;

  const files: ProjectFiles = useMemo(
    () => (progress?.status === "running" && progress.files ? progress.files : state.files),
    [progress?.status, progress?.files, state.files],
  );
  const hasApp = Boolean(state.versionId) || Boolean(progress?.files);
  const busy = Boolean(runId) || state.activeRun !== null;
  const latestPlanId = state.plan?.id ?? null;
  const canBuild = canEdit && !state.versionId && state.plan?.status === "proposed" && !busy;

  // Text typed straight onto a screen (double-click, then Enter): saved like an inspector edit,
  // with no AI and no credits.
  const saveText = async (fid: string, text: string) => {
    if (!canEdit || !state.versionId) return;
    try {
      await api(`/api/projects/${project.id}/inline-edit`, {
        method: "POST",
        json: { versionId: state.versionId, fid, patch: { text } },
        quiet: true,
      });
      toast.success("Saved");
      await refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't save that text.");
      // Put the screens back to what's saved.
      setCanvasKey((k) => k + 1);
      setAppKey((k) => k + 1);
    }
  };

  const onFrameMessage = (frameId: string, message: FrameToParent) => {
    if (message.type === "theme-info" && frameId === "app") {
      setThemes(message.themes);
      setCanSwitchAppearance(Boolean(message.canSwitchAppearance));
    }
    // Select mode, or a double-click on text that comes from data or code (editors only).
    if (message.type === "select" && canEdit) {
      setSelected(message.element);
      setCodeFocus(parseFid(message.element.fid)?.path ?? null);
    }
    if (message.type === "text-edit") void saveText(message.fid, message.text);
    if (message.type === "navigate-request" && message.action !== "back" && message.href) {
      setAppHref(message.href);
      setAppKey((k) => k + 1);
    }
  };

  const startRun = (id: string) => {
    setRunId(id);
    setState((s) => ({ ...s, activeRun: { id, kind: "run", status: "queued" } }));
  };

  const send = async (text: string): Promise<boolean> => {
    const selection = chatSelection
      ? { path: chatSelection.path, snippet: chatSelection.snippet, kind: chatSelection.kind }
      : null;
    try {
      const optimistic = {
        id: `local-${Date.now()}`,
        role: "user" as const,
        kind: "text" as const,
        content: { text, selection },
        createdAt: new Date().toISOString(),
      };
      setState((s) => ({ ...s, messages: [...s.messages, optimistic] }));
      const result = await api<{ runId: string }>(`/api/projects/${project.id}/messages`, {
        method: "POST",
        json: { text, selection },
      });
      setChatSelection(null);
      startRun(result.runId);
      return true;
    } catch {
      void refresh();
      return false;
    }
  };

  const build = async () => {
    const result = await api<{ runId: string }>(`/api/projects/${project.id}/build`, {
      method: "POST",
    });
    startRun(result.runId);
  };

  const cancel = async () => {
    if (runId) await api(`/api/runs/${runId}/cancel`, { method: "POST" });
  };

  // The preview switches at once; the pick is saved into the app (a "Theme" version) once the
  // user settles on one, so clicking through themes doesn't make a version per click.
  const themeSave = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chooseTheme = (id: string) => {
    setThemeId(id);
    setAppAppearance(null);
    if (!canEdit) return;
    if (themeSave.current) clearTimeout(themeSave.current);
    themeSave.current = setTimeout(async () => {
      const result = await api<{ versionId: string | null }>(`/api/projects/${project.id}`, {
        method: "PATCH",
        json: { activeThemeId: id },
        quiet: true,
      }).catch(() => null);
      if (result?.versionId) await refresh();
    }, 800);
  };

  const applyInline = async (patch: InlinePatch) => {
    if (!selected) return;
    try {
      await api(`/api/projects/${project.id}/inline-edit`, {
        method: "POST",
        json: { versionId: state.versionId, fid: selected.fid, patch },
        quiet: true,
      });
      toast.success("Saved");
      setSelected(null);
      await refresh();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : "Couldn't apply that change.");
    }
  };

  const askAI = () => {
    if (!selected) return;
    const target = parseFid(selected.fid);
    if (!target) return;
    const snippet = state.files[target.path]?.slice(target.start, target.end) ?? "";
    setChatSelection({
      kind: "element",
      path: target.path,
      snippet,
      label: selected.text ? `“${selected.text.slice(0, 40)}”` : target.path,
    });
    setSelectMode(false);
    setSelected(null);
  };

  const rename = async () => {
    const name = window.prompt("Rename project", project.name);
    if (!name || name === project.name) return;
    await api(`/api/projects/${project.id}`, { method: "PATCH", json: { name } });
    void refresh();
  };

  const remix = async () => {
    if (!user) {
      router.push("/sign-up");
      return;
    }
    const copy = await api<{ id: string }>(`/api/projects/${project.id}/duplicate`, {
      method: "POST",
    });
    toast.success(access === "owner" ? "Duplicated" : "Remixed into your projects");
    router.push(`/projects/${copy.id}`);
  };

  const activeTheme = themes.find((t) => t.id === themeId) ?? themes[0];
  const buildingNow =
    progress?.status === "running" &&
    (state.activeRun?.kind === "build" || project.status === "building");

  const emptyState = (
    <div className="max-w-md text-center" data-testid="canvas-empty">
      {busy ? (
        <>
          <Loader2 className="mx-auto mb-3 size-6 animate-spin text-primary" />
          <p className="font-medium">{progress?.step ?? "Starting…"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Screens appear here as soon as they are built.
          </p>
        </>
      ) : state.plan && !state.versionId ? (
        <>
          <Sparkles className="mx-auto mb-3 size-6 text-primary" />
          <p className="font-medium">Review the plan in the chat</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Confirm it to build {state.plan.data.screens.length} screens, or ask for changes first.
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground">
          Describe your app in the chat to get started.
        </p>
      )}
    </div>
  );

  const shellUser = user ?? { name: "Guest", email: "", image: null };

  return (
    <AppShell
      user={shellUser}
      sidebar={
        seeSource ? (
          <>
            <SidebarHeader>
              <Button variant="ghost" size="icon" className="size-7" asChild>
                <Link href="/" aria-label="Back to projects">
                  <ChevronLeft />
                </Link>
              </Button>
              <span
                className="min-w-0 flex-1 truncate text-sm font-semibold"
                data-testid="project-name"
              >
                {project.name}
              </span>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="size-7" aria-label="Project menu">
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {canEdit ? (
                    <DropdownMenuItem onSelect={rename}>
                      <Pencil /> Rename
                    </DropdownMenuItem>
                  ) : null}
                  <DropdownMenuItem onSelect={remix} disabled={!state.versionId}>
                    <Copy /> Duplicate
                  </DropdownMenuItem>
                  {canManage ? (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={async () => {
                          if (!window.confirm(`Delete “${project.name}”?`)) return;
                          await api(`/api/projects/${project.id}`, { method: "DELETE" });
                          router.push("/");
                        }}
                      >
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarHeader>
            <ChatPanel
              messages={state.messages}
              latestPlanId={latestPlanId}
              canBuild={canBuild}
              readOnly={!canEdit}
              progress={progress}
              busy={busy}
              selection={chatSelection}
              onClearSelection={() => setChatSelection(null)}
              onSend={send}
              onBuild={build}
              onCancel={cancel}
              userInitial={(user?.name ?? "Y").slice(0, 1).toUpperCase()}
            />
          </>
        ) : undefined
      }
      tabs={
        <>
          {seeSource ? (
            <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
              <TabsList>
                <TabsTrigger value="canvas">Canvas</TabsTrigger>
                <TabsTrigger value="data" data-testid="tab-data">
                  Data
                </TabsTrigger>
                <TabsTrigger value="code" data-testid="tab-code">
                  Code
                </TabsTrigger>
                <TabsTrigger value="history" data-testid="tab-history">
                  History
                </TabsTrigger>
              </TabsList>
            </Tabs>
          ) : (
            <span className="px-2 text-sm font-semibold">{project.name}</span>
          )}
          <div className="ml-auto flex items-center gap-1.5">
            {access === "public" || access === "viewer" ? (
              <Button size="sm" variant="outline" onClick={remix} disabled={!state.versionId}>
                <Copy /> Remix
              </Button>
            ) : null}
            {seeSource ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDialog("share")}
                data-testid="open-share"
              >
                <Share2 /> Share
              </Button>
            ) : null}
            {seeSource ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setDialog("export")}
                disabled={!state.versionId}
                data-testid="open-export"
              >
                <Download /> Export
              </Button>
            ) : null}
            {canManage ? (
              <Button
                size="sm"
                onClick={() => setDialog("publish")}
                disabled={!state.versionId}
                data-testid="open-publish"
              >
                <Upload /> Publish
              </Button>
            ) : null}
          </div>
        </>
      }
      aside={
        <>
          <section className="border-b p-4">
            <div className="mb-3 flex items-center gap-1.5">
              <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Preview
              </h2>
              <span
                className="truncate font-mono text-[10px] text-muted-foreground"
                data-testid="app-href"
              >
                {appHref}
              </span>
              <div className="ml-auto flex gap-1">
                {canEdit ? (
                  <Button
                    size="icon"
                    variant={selectMode ? "default" : "ghost"}
                    className="size-7"
                    onClick={() => {
                      setSelectMode((s) => !s);
                      setSelected(null);
                    }}
                    aria-label="Select an element to edit"
                    aria-pressed={selectMode}
                    data-testid="select-toggle"
                    disabled={!hasApp}
                  >
                    <MousePointerClick />
                  </Button>
                ) : null}
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label="Reload preview"
                  onClick={() => setAppKey((k) => k + 1)}
                  disabled={!hasApp}
                >
                  <RotateCw />
                </Button>
              </div>
            </div>
            <div className="flex justify-center">
              {hasApp ? (
                <PreviewFrame
                  key={appKey}
                  frameId="app"

                  storage={previewStorage}
                  files={files}
                  mode="app"
                  href={appHref}
                  themeId={themeId}
                  appearance={appAppearance}
                  editText={canEdit}
                  selectMode={selectMode}
                  width={390}
                  height={844}
                  scale={0.78}
                  onMessage={(m) => {
                    if (m.type === "navigated") setAppHref(m.href);
                    onFrameMessage("app", m);
                  }}
                />
              ) : (
                <div className="flex h-[658px] w-[304px] items-center justify-center rounded-[2rem] border-8 border-neutral-200 text-center text-xs text-muted-foreground">
                  The interactive preview appears after the build.
                </div>
              )}
            </div>
            {canEdit && hasApp ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 w-full"
                onClick={() => setDialog("device")}
                disabled={!state.versionId}
                data-testid="open-device"
              >
                <Smartphone /> Open on your phone
              </Button>
            ) : null}
          </section>
          {seeSource && state.versionId ? (
            <AppCloudPanel
              projectId={project.id}
              backend={project.backend}
              canManage={canManage}
              disabled={busy}
              onChanged={refresh}
              onOpenData={() => setTab("data")}
            />
          ) : null}
          {selected ? (
            <Inspector
              key={selected.fid}
              element={selected}
              theme={activeTheme}
              canEdit={canEdit}
              onApply={applyInline}
              onAskAI={askAI}
              onClose={() => setSelected(null)}
            />
          ) : null}
          <PanelSection title="Themes">
            {canSwitchAppearance && activeTheme ? (
              <AppAppearance
                shown={appAppearance ?? (activeTheme.dark ? "dark" : "light")}
                onChange={(mode) =>
                  setAppAppearance(mode === (activeTheme.dark ? "dark" : "light") ? null : mode)
                }
              />
            ) : null}
            <ThemeList themes={themes} activeId={themeId ?? themes[0]?.id} onSelect={chooseTheme} />
          </PanelSection>
        </>
      }
      bottomLeft={
        <>
          {busy ? (
            <span className="flex items-center gap-1.5" data-testid="status">
              <Loader2 className="size-3 animate-spin" /> {progress?.step ?? "Working…"}
            </span>
          ) : (
            <span data-testid="status">{STATUS_LABEL[project.status]}</span>
          )}
          {state.versionNumber ? <span>· Version {state.versionNumber}</span> : null}
          {progress?.offline ? (
            <Badge variant="outline" className="h-4 text-[10px]">
              offline generator
            </Badge>
          ) : null}
        </>
      }
      bottomRight={
        <>
          {state.credits !== null ? (
            <span data-testid="workspace-credits">{state.credits} credits</span>
          ) : null}
          <span>Expo SDK 58</span>
        </>
      }
    >
      {tab === "canvas" ? (
        <Canvas
          key={canvasKey}
          files={files}
          themeId={themeId}
          appearance={appAppearance}
          editText={canEdit && hasApp}
          selectMode={selectMode}
          onFrameMessage={onFrameMessage}
          onOpenScreen={(href) => {
            setAppHref(href);
            setAppKey((k) => k + 1);
          }}
          onSelectScreen={
            canEdit && hasApp
              ? (file, title) =>
                  setChatSelection({
                    kind: "screen",
                    path: file,
                    snippet: "",
                    label: `${title} screen`,
                  })
              : undefined
          }
          selectedFile={chatSelection?.kind === "screen" ? chatSelection.path : undefined}
          building={Boolean(buildingNow)}
          storage={previewStorage}
          emptyState={emptyState}
        />
      ) : tab === "data" ? (
        <DataView projectId={project.id} canManage={canManage} refreshKey={state.versionId} />
      ) : tab === "code" ? (
        <CodeView key={codeFocus ?? "default"} files={files} focusPath={codeFocus} />
      ) : (
        <HistoryView
          projectId={project.id}
          currentVersionId={state.versionId}
          canEdit={canEdit}
          onRestored={refresh}
        />
      )}

      <ShareDialog
        open={dialog === "share"}
        onOpenChange={(o) => setDialog(o ? "share" : null)}
        projectId={project.id}
        canManage={canManage}
      />
      <ExportDialog
        open={dialog === "export"}
        onOpenChange={(o) => setDialog(o ? "export" : null)}
        projectId={project.id}
        projectName={project.name}
      />
      <PublishDialog
        open={dialog === "publish"}
        onOpenChange={(o) => setDialog(o ? "publish" : null)}
        projectId={project.id}
        slug={project.publishedSlug}
        visibility={project.visibility}
        onChanged={refresh}
      />
      <DeviceDialog
        open={dialog === "device"}
        onOpenChange={(o) => setDialog(o ? "device" : null)}
        projectId={project.id}
      />
    </AppShell>
  );
}

/** Light or night mode for the app preview; the picked theme stays the app's theme. */
function AppAppearance({
  shown,
  onChange,
}: {
  shown: "light" | "dark";
  onChange: (mode: "light" | "dark") => void;
}) {
  return (
    <div className="mb-3">
      <div className="flex gap-1 rounded-lg border p-0.5" role="group" aria-label="App appearance">
        {(["light", "dark"] as const).map((mode) => (
          <Button
            key={mode}
            size="sm"
            variant={shown === mode ? "secondary" : "ghost"}
            className="h-7 flex-1 text-xs"
            aria-pressed={shown === mode}
            onClick={() => onChange(mode)}
            data-testid={`app-appearance-${mode}`}
          >
            {mode === "light" ? <Sun /> : <Moon />} {mode === "light" ? "Light" : "Night"}
          </Button>
        ))}
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        On phones the app follows the phone&rsquo;s setting, and people can switch it in the
        app&rsquo;s Settings.
      </p>
    </div>
  );
}
