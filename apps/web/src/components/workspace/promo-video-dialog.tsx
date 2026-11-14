"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Clapperboard,
  Download,
  Loader2,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import {
  normalizeStoryboard,
  PROMO_FORMATS,
  PROMO_LIMITS,
  promoProblems,
  promoScreens,
  promoTimeline,
  type PreviewTheme,
  type ProjectFiles,
  type PromoFocus,
  type PromoFormat,
  type PromoStoryboard,
} from "@appbuilder/contract/protocol";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useRunStream } from "@/hooks/use-run-stream";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Capturer } from "./store-listing-dialog";

interface Video {
  id: string;
  format: PromoFormat;
  seconds: number;
  hook: string;
  createdAt: string;
}

const FOCUS: Array<{ value: PromoFocus; label: string }> = [
  { value: "top", label: "Top" },
  { value: "middle", label: "Middle" },
  { value: "bottom", label: "Bottom" },
];

/** "app/(tabs)/index.tsx" → "Home", "app/lesson/[id].tsx" → "Lesson". */
function screenLabel(file: string): string {
  const parts = file
    .replace(/^app\//, "")
    .replace(/\.tsx?$/, "")
    .split("/")
    .filter((p) => !/^\(.*\)$/.test(p) && !/^\[.*\]$/.test(p));
  const name = parts.at(-1) === "index" ? (parts.at(-2) ?? "home") : (parts.at(-1) ?? file);
  return name.replace(/[-_]+/g, " ").replace(/^./, (c) => c.toUpperCase());
}

/** A capture as JPEG: a fraction of the PNG's size, plenty for a phone in a video frame. */
async function toJpeg(png: string): Promise<Blob> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read the screen capture."));
    img.src = png;
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  canvas.getContext("2d")!.drawImage(image, 0, 0);
  return new Promise((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Couldn't encode."))),
      "image/jpeg",
      0.9,
    ),
  );
}

/** The project's rendered videos (newest first) and the last storyboard the AI wrote. */
async function latestPromo(projectId: string): Promise<{ videos: Video[]; storyboard: unknown }> {
  const { runs } = await api<{
    runs: Array<{
      id: string;
      kind: string;
      status: string;
      output: Record<string, unknown> | null;
      createdAt: string;
    }>;
  }>(`/api/projects/${projectId}/runs`, { quiet: true });
  const done = runs.filter((r) => r.status === "succeeded" && r.output);
  return {
    videos: done
      .filter((r) => r.kind === "promo_render")
      .map((r) => ({
        id: r.id,
        format: r.output!.format as PromoFormat,
        seconds: Number(r.output!.seconds),
        hook: String(r.output!.hook ?? ""),
        createdAt: r.createdAt,
      })),
    storyboard: done.find((r) => r.kind === "promo_storyboard")?.output?.storyboard ?? null,
  };
}

function draftKey(projectId: string) {
  return `promo-draft:${projectId}`;
}

/**
 * Promo videos of the app, made the Sizzle way: the AI writes a storyboard from the plan, the
 * owner edits it (cheap), and the render films the app's real screens (a few minutes).
 */
export function PromoVideoDialog({
  open,
  onOpenChange,
  projectId,
  files,
  themeId,
  theme,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  files: ProjectFiles;
  themeId?: string;
  theme: PreviewTheme | undefined;
  canEdit: boolean;
}) {
  const screens = useMemo(() => promoScreens(Object.keys(files)), [files]);
  const [board, setBoard] = useState<PromoStoryboard | null>(null);
  const [videos, setVideos] = useState<Video[]>([]);
  const [writeRun, setWriteRun] = useState<string | null>(null);
  const [renderRun, setRenderRun] = useState<string | null>(null);
  const [format, setFormat] = useState<PromoFormat>("vertical");
  const [music, setMusic] = useState<File | null>(null);
  const [rights, setRights] = useState(false);
  // Captures belong to this version and theme of the app: a new one starts a new set.
  const captureKey = useMemo(() => ({ files, themeId }), [files, themeId]);
  const [captures, setCaptures] = useState({ key: captureKey, map: {} as Record<string, string> });
  const shots = captures.key === captureKey ? captures.map : {};
  const [queue, setQueue] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRender = useRef(false);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    void latestPromo(projectId)
      .then(({ videos: found, storyboard: written }) => {
        if (!alive) return;
        setVideos(found);
        let draft: unknown = null;
        try {
          draft = JSON.parse(localStorage.getItem(draftKey(projectId)) ?? "null");
        } catch {
          // No saved draft.
        }
        const source = draft ?? written;
        if (source) setBoard(normalizeStoryboard(source, screens));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, projectId, screens]);

  const edit = (next: PromoStoryboard) => {
    setBoard(next);
    try {
      localStorage.setItem(draftKey(projectId), JSON.stringify(next));
    } catch {
      // Drafts are a convenience.
    }
  };

  const writing = useRunStream(writeRun, async (p) => {
    setWriteRun(null);
    if (p.status !== "done") return;
    try {
      localStorage.removeItem(draftKey(projectId));
    } catch {
      // Nothing to clear.
    }
    const found = await latestPromo(projectId).catch(() => null);
    if (found?.storyboard) setBoard(normalizeStoryboard(found.storyboard, screens));
  });

  const progress = useRunStream(renderRun, async (p) => {
    setRenderRun(null);
    setRendering(false);
    if (p.status !== "done") return;
    const found = await latestPromo(projectId).catch(() => null);
    if (found) setVideos(found.videos);
  });

  const write = async () => {
    setError(null);
    try {
      const { runId } = await api<{ runId: string }>(`/api/projects/${projectId}/promo`, {
        method: "POST",
      });
      setWriteRun(runId);
    } catch {
      // api() already showed the error.
    }
  };

  const submit = useCallback(
    async (captured: Record<string, string>) => {
      if (!board) return;
      try {
        const form = new FormData();
        form.set("format", format);
        form.set("storyboard", JSON.stringify(board));
        form.set("colors", JSON.stringify(theme?.colors ?? {}));
        for (const [i, beat] of board.beats.entries()) {
          form.set(`shot-${i}`, await toJpeg(captured[beat.screen]!), `shot-${i}.jpg`);
        }
        if (music) {
          form.set("music", music);
          form.set("musicRights", rights ? "yes" : "no");
        }
        const { runId } = await api<{ runId: string }>(`/api/projects/${projectId}/promo/render`, {
          method: "POST",
          body: form,
          quiet: true,
        });
        setRenderRun(runId);
      } catch (e) {
        setRendering(false);
        setError((e as Error).message);
      }
    },
    [board, format, theme, music, rights, projectId],
  );

  const render = () => {
    if (!board) return;
    setError(null);
    setRendering(true);
    const missing = board.beats.map((b) => b.screen).filter((s) => !shots[s]);
    if (missing.length === 0) void submit(shots);
    else {
      pendingRender.current = true;
      setQueue(missing);
    }
  };

  // Screens are captured one at a time from the app's own preview, then the render starts.
  const captured = (screen: string, png: string) => {
    const next = { ...shots, [screen]: png };
    setCaptures({ key: captureKey, map: next });
    const rest = queue.slice(1);
    setQueue(rest);
    if (rest.length === 0 && pendingRender.current) {
      pendingRender.current = false;
      void submit(next);
    }
  };

  const problems = board ? promoProblems(board) : [];
  const seconds = board && board.beats.length ? Math.round(promoTimeline(board).duration) : 0;
  const unused = screens.filter((s) => !board?.beats.some((b) => b.screen === s));
  const busy = Boolean(writeRun) || rendering;

  const setBeat = (index: number, patch: Partial<PromoStoryboard["beats"][number]>) =>
    board &&
    edit({ ...board, beats: board.beats.map((b, i) => (i === index ? { ...b, ...patch } : b)) });
  const moveBeat = (index: number, by: number) => {
    if (!board) return;
    const beats = [...board.beats];
    const [beat] = beats.splice(index, 1);
    beats.splice(index + by, 0, beat!);
    edit({ ...board, beats });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-[min(84rem,calc(100%-2rem))]"
        data-testid="promo-dialog"
      >
        <DialogHeader>
          <DialogTitle>Promo video</DialogTitle>
          <DialogDescription>
            A short film of your app for TikTok, Reels, Shorts or your site, made from its real
            screens: a hook, one benefit per screen, and a closing card. The paywall and settings
            stay out, because in the preview they show test purchases.
          </DialogDescription>
        </DialogHeader>

        {writeRun ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {writing?.step ?? "Writing the storyboard…"}
          </p>
        ) : !board ? (
          <div className="flex flex-col items-start gap-2">
            <Button onClick={write} disabled={!canEdit} data-testid="promo-write">
              <Sparkles /> Write the storyboard
            </Button>
            <p className="text-xs text-muted-foreground">
              About 1 credit. You can change every word and the order before rendering.
            </p>
          </div>
        ) : (
          <div className="space-y-5" data-testid="promo-board">
            <Field label="Hook" hint="On screen from the first frame. 3–7 words.">
              <Input
                value={board.hook}
                maxLength={PROMO_LIMITS.hook}
                disabled={!canEdit || busy}
                onChange={(e) => edit({ ...board, hook: e.target.value })}
                data-testid="promo-hook"
              />
            </Field>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between text-sm font-medium">
                Screens
                <span className="text-xs font-normal text-muted-foreground">
                  One benefit each; the last one is the payoff and holds longest.
                </span>
              </div>
              <ol className="space-y-2">
                {board.beats.map((beat, i) => (
                  <li
                    key={beat.screen}
                    className="flex items-start gap-3 rounded-lg border p-2"
                    data-testid="promo-beat"
                  >
                    <div className="h-[104px] w-12 shrink-0 overflow-hidden rounded-md border bg-muted">
                      {shots[beat.screen] ? (
                        // Captured from the app's own preview.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={shots[beat.screen]} alt="" className="size-full object-cover" />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 space-y-1.5">
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">
                          {i + 1}. {screenLabel(beat.screen)}
                        </span>
                        <span>Camera on</span>
                        <select
                          className="rounded border bg-background px-1 py-0.5 text-xs"
                          value={beat.focus}
                          disabled={!canEdit || busy}
                          onChange={(e) => setBeat(i, { focus: e.target.value as PromoFocus })}
                          aria-label={`Camera focus for screen ${i + 1}`}
                        >
                          {FOCUS.map((f) => (
                            <option key={f.value} value={f.value}>
                              {f.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <Input
                        value={beat.caption}
                        maxLength={PROMO_LIMITS.caption}
                        disabled={!canEdit || busy}
                        onChange={(e) => setBeat(i, { caption: e.target.value })}
                        aria-label={`Caption for screen ${i + 1}`}
                      />
                    </div>
                    <div className="flex shrink-0 flex-col">
                      <IconButton
                        label="Move up"
                        disabled={!canEdit || busy || i === 0}
                        onClick={() => moveBeat(i, -1)}
                      >
                        <ArrowUp />
                      </IconButton>
                      <IconButton
                        label="Move down"
                        disabled={!canEdit || busy || i === board.beats.length - 1}
                        onClick={() => moveBeat(i, 1)}
                      >
                        <ArrowDown />
                      </IconButton>
                      <IconButton
                        label="Remove"
                        disabled={!canEdit || busy || board.beats.length <= PROMO_LIMITS.minBeats}
                        onClick={() =>
                          edit({ ...board, beats: board.beats.filter((_, j) => j !== i) })
                        }
                      >
                        <X />
                      </IconButton>
                    </div>
                  </li>
                ))}
              </ol>
              {canEdit && board.beats.length < PROMO_LIMITS.maxBeats && unused.length ? (
                <div className="flex items-center gap-2">
                  <Plus className="size-4 text-muted-foreground" />
                  <select
                    className="rounded-md border bg-background px-2 py-1 text-sm"
                    value=""
                    disabled={busy}
                    onChange={(e) =>
                      e.target.value &&
                      edit({
                        ...board,
                        beats: [
                          ...board.beats,
                          { screen: e.target.value, caption: "", focus: "top" },
                        ],
                      })
                    }
                    aria-label="Add a screen"
                  >
                    <option value="">Add a screen…</option>
                    {unused.map((s) => (
                      <option key={s} value={s}>
                        {screenLabel(s)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Tagline" hint="Under the app's name at the end.">
                <Input
                  value={board.tagline}
                  maxLength={PROMO_LIMITS.tagline}
                  disabled={!canEdit || busy}
                  onChange={(e) => edit({ ...board, tagline: e.target.value })}
                />
              </Field>
              <Field label="Call to action" hint="Only what's true today.">
                <Input
                  value={board.cta}
                  maxLength={PROMO_LIMITS.cta}
                  disabled={!canEdit || busy}
                  onChange={(e) => edit({ ...board, cta: e.target.value })}
                />
              </Field>
            </div>

            <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Format">
              {(Object.keys(PROMO_FORMATS) as PromoFormat[]).map((f) => (
                <button
                  key={f}
                  type="button"
                  role="radio"
                  aria-checked={format === f}
                  disabled={busy}
                  onClick={() => setFormat(f)}
                  className={cn(
                    "rounded-lg border p-3 text-left text-sm transition-colors",
                    format === f ? "border-foreground" : "hover:bg-muted",
                  )}
                  data-testid={`promo-format-${f}`}
                >
                  <div className="font-medium">{PROMO_FORMATS[f].label}</div>
                  <div className="text-xs text-muted-foreground">{PROMO_FORMATS[f].use}</div>
                </button>
              ))}
            </div>

            <div className="space-y-1.5 rounded-lg border p-3 text-sm">
              <div className="font-medium">Music (optional)</div>
              <p className="text-xs text-muted-foreground">
                The film works without sound. Add only a track you have the rights to use; for
                AI-made music that usually means the generator&rsquo;s paid plan. MP3, M4A, WAV or
                OGG, up to 12 MB.
              </p>
              <input
                type="file"
                accept="audio/mpeg,audio/mp4,audio/x-m4a,audio/wav,audio/ogg,.mp3,.m4a,.wav,.ogg"
                disabled={busy}
                onChange={(e) => setMusic(e.target.files?.[0] ?? null)}
                className="block text-xs"
                aria-label="Music file"
              />
              {music ? (
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={rights}
                    onChange={(e) => setRights(e.target.checked)}
                  />
                  I have the rights to use this music in a promo video.
                </label>
              ) : null}
            </div>

            {problems.length ? <p className="text-sm text-destructive">{problems[0]}</p> : null}
            {error ? <p className="text-sm text-destructive">{error}</p> : null}

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={render}
                disabled={!canEdit || busy || problems.length > 0 || (Boolean(music) && !rights)}
                data-testid="promo-render"
              >
                {rendering ? <Loader2 className="animate-spin" /> : <Clapperboard />} Render video
              </Button>
              <Button variant="outline" onClick={write} disabled={!canEdit || busy}>
                <Sparkles /> Write again
              </Button>
              <span className="text-xs text-muted-foreground">
                About {seconds} s · 1 credit · a few minutes
              </span>
            </div>
            {rendering ? (
              <p
                className="flex items-center gap-2 text-sm text-muted-foreground"
                data-testid="promo-progress"
              >
                <Loader2 className="size-4 animate-spin" />
                {queue.length
                  ? `Capturing ${screenLabel(queue[0]!)} from the preview…`
                  : (progress?.step ?? "Waiting for the renderer…")}
              </p>
            ) : progress?.status === "error" ? (
              <p className="text-sm text-destructive">{progress.error}</p>
            ) : null}
          </div>
        )}

        {videos.length ? (
          <div className="space-y-3 border-t pt-4" data-testid="promo-videos">
            <div className="text-sm font-medium">Your videos</div>
            {videos.map((v) => (
              <div key={v.id} className="flex flex-col gap-2 sm:flex-row sm:items-start">
                <video
                  controls
                  playsInline
                  preload="metadata"
                  poster={`/api/projects/${projectId}/promo/${v.id}/poster.jpg`}
                  src={`/api/projects/${projectId}/promo/${v.id}/video.mp4`}
                  className={cn(
                    "rounded-lg border bg-black",
                    v.format === "vertical" ? "max-h-[420px] w-auto" : "w-full sm:max-w-md",
                  )}
                  data-testid="promo-video"
                />
                <div className="space-y-1 text-sm">
                  <div className="font-medium">{v.hook}</div>
                  <div className="text-xs text-muted-foreground">
                    {PROMO_FORMATS[v.format]?.label} · {Math.round(v.seconds)} s ·{" "}
                    {new Date(v.createdAt).toLocaleString()}
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <a href={`/api/projects/${projectId}/promo/${v.id}/video.mp4?download=1`}>
                      <Download /> Download MP4
                    </a>
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : null}

        {queue[0] ? (
          <Capturer
            key={queue[0]}
            files={files}
            screen={queue[0]}
            themeId={themeId}
            scale={2}
            onCaptured={(png) => captured(queue[0]!, png)}
            onFailed={(message) => {
              pendingRender.current = false;
              setQueue([]);
              setRendering(false);
              setError(message);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-baseline justify-between gap-2 text-sm font-medium">
        {label}
        <span className="text-xs font-normal text-muted-foreground">{hint}</span>
      </span>
      {children}
    </label>
  );
}

function IconButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded p-1 text-muted-foreground hover:bg-muted disabled:opacity-30 [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}
