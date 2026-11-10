"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import { Check, Copy, Download, Images, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  buildRouteTree,
  screens as listScreens,
  STORE_LIMITS,
  type PreviewTheme,
  type ProjectFiles,
  type StoreListing,
} from "@appbuilder/contract/protocol";
import { PreviewFrame, type PreviewFrameHandle } from "@/components/preview/preview-frame";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useRunStream } from "@/hooks/use-run-stream";
import { api } from "@/lib/api";
import { canvasHref } from "./canvas";

/** Store screenshot sizes: App Store 6.9" (1290×2796) and Google Play phone (1080×1920). */
const SIZES = {
  appStore: { width: 1290, height: 2796, folder: "app-store" },
  googlePlay: { width: 1080, height: 1920, folder: "google-play" },
} as const;

interface Shot {
  screen: string;
  caption: string;
  appStore: string;
  googlePlay: string;
}

export function StoreListingDialog({
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
  const [listing, setListing] = useState<StoreListing | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [capturing, setCapturing] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let alive = true;
    latestListing(projectId)
      .then((found) => alive && found && setListing(found))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, projectId]);

  const progress = useRunStream(runId, async (p) => {
    const found = p.status === "done" ? await latestListing(projectId) : null;
    if (found) setListing(found);
    setRunId(null);
  });

  const write = async () => {
    const { runId } = await api<{ runId: string }>(`/api/projects/${projectId}/store-listing`, {
      method: "POST",
    });
    setShots([]);
    setRunId(runId);
  };

  const download = async () => {
    if (!listing) return;
    const zip = new JSZip();
    zip.file("listing.txt", listingText(listing));
    for (const [index, shot] of shots.entries()) {
      const name = `${String(index + 1).padStart(2, "0")}-${slug(shot.caption)}.png`;
      zip.file(`${SIZES.appStore.folder}/${name}`, shot.appStore.split(",")[1]!, { base64: true });
      zip.file(`${SIZES.googlePlay.folder}/${name}`, shot.googlePlay.split(",")[1]!, {
        base64: true,
      });
    }
    const blob = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${slug(listing.name) || "app"}-store-listing.zip`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Store listing</DialogTitle>
          <DialogDescription>
            The text and screenshots App Store Connect and Google Play Console ask for, written for
            this app and sized to each store&rsquo;s limits.
          </DialogDescription>
        </DialogHeader>

        {runId ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> {progress?.step ?? "Writing the listing…"}
          </p>
        ) : !listing ? (
          <Button onClick={write} disabled={!canEdit} data-testid="listing-write">
            <Sparkles /> Write the listing
          </Button>
        ) : (
          <div className="space-y-4" data-testid="listing">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Name" value={listing.name} max={STORE_LIMITS.name} />
              <Field label="Subtitle" value={listing.subtitle} max={STORE_LIMITS.subtitle} />
              <Field
                label="Promotional text"
                value={listing.promotionalText}
                max={STORE_LIMITS.promotionalText}
              />
              <Field
                label="Google Play short description"
                value={listing.shortDescription}
                max={STORE_LIMITS.shortDescription}
              />
              <Field label="Keywords" value={listing.keywords} max={STORE_LIMITS.keywords} />
              <Field label="Category" value={listing.category} />
            </div>
            <Field
              label="Description"
              value={listing.description}
              max={STORE_LIMITS.description}
              long
            />

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => setCapturing(listing.screenshots[0]?.screen ?? null)}
                disabled={Boolean(capturing) || listing.screenshots.length === 0}
                data-testid="listing-screenshots"
              >
                {capturing ? <Loader2 className="animate-spin" /> : <Images />} Make screenshots
              </Button>
              <Button variant="outline" onClick={download} disabled={!shots.length}>
                <Download /> Download all
              </Button>
              {canEdit ? (
                <Button variant="ghost" onClick={write}>
                  <Sparkles /> Write it again
                </Button>
              ) : null}
            </div>

            {shots.length ? (
              <div className="grid grid-cols-3 gap-3 sm:grid-cols-5" data-testid="listing-shots">
                {shots.map((shot) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    key={shot.screen}
                    src={shot.appStore}
                    alt={shot.caption}
                    className="w-full rounded-lg border"
                  />
                ))}
              </div>
            ) : null}
          </div>
        )}

        {capturing && listing ? (
          <Capturer
            key={capturing}
            files={files}
            screen={capturing}
            themeId={themeId}
            onCaptured={async (png) => {
              const caption =
                listing.screenshots.find((s) => s.screen === capturing)?.caption ?? "";
              const shot: Shot = {
                screen: capturing,
                caption,
                appStore: await frame(png, caption, SIZES.appStore, theme),
                googlePlay: await frame(png, caption, SIZES.googlePlay, theme),
              };
              const next = [...shots.filter((s) => s.screen !== capturing), shot];
              setShots(next);
              const index = listing.screenshots.findIndex((s) => s.screen === capturing);
              setCapturing(listing.screenshots[index + 1]?.screen ?? null);
            }}
            onFailed={(message) => {
              toast.error(message);
              setCapturing(null);
            }}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  value,
  max,
  long,
}: {
  label: string;
  value: string;
  max?: number;
  long?: boolean;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-lg border p-3">
      <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
        {label}
        {max ? (
          <span className="tabular-nums">
            {value.length}/{max}
          </span>
        ) : null}
        <button
          type="button"
          className="ml-auto"
          aria-label={`Copy ${label}`}
          onClick={async () => {
            await navigator.clipboard?.writeText(value).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
        </button>
      </div>
      <p className={long ? "whitespace-pre-wrap text-sm" : "text-sm"}>{value}</p>
    </div>
  );
}

/** One screen rendered off-screen at full device size, captured once it has rendered. */
function Capturer({
  files,
  screen,
  themeId,
  onCaptured,
  onFailed,
}: {
  files: ProjectFiles;
  screen: string;
  themeId?: string;
  onCaptured: (png: string) => void;
  onFailed: (message: string) => void;
}) {
  const ref = useRef<PreviewFrameHandle>(null);
  const done = useRef(false);
  const route = listScreens(buildRouteTree(Object.keys(files))).find(
    (s) => s.screen.file === screen,
  )?.screen;
  if (!route) {
    queueMicrotask(() => onFailed(`${screen} isn't a screen of the app any more.`));
    return null;
  }
  // On screen but invisible: Chrome doesn't render cross-origin frames that are off-screen.
  return createPortal(
    <div aria-hidden className="pointer-events-none fixed left-0 top-0 -z-10 opacity-0">
      <PreviewFrame
        ref={ref}
        frameId={`store:${screen}`}
        files={files}
        mode="screen"
        href={canvasHref(route)}
        themeId={themeId}
        width={390}
        height={844}
        onMessage={(message) => {
          if (message.type !== "rendered" || done.current) return;
          done.current = true;
          // Let images and fonts settle before the picture is taken.
          setTimeout(() => {
            ref.current
              ?.capture(3)
              .then(onCaptured)
              .catch((e: Error) => onFailed(e.message));
          }, 1200);
        }}
      />
    </div>,
    document.body,
  );
}

/** A store screenshot: the caption over the theme's color, the screen in a rounded frame. */
async function frame(
  png: string,
  caption: string,
  size: { width: number; height: number },
  theme: PreviewTheme | undefined,
): Promise<string> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Couldn't read the screenshot."));
    img.src = png;
  });
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext("2d")!;
  const primary = theme?.colors.primary ?? "#111827";
  const onPrimary = theme?.colors.onPrimary ?? "#ffffff";
  ctx.fillStyle = primary;
  ctx.fillRect(0, 0, size.width, size.height);
  const shade = ctx.createLinearGradient(0, 0, 0, size.height);
  shade.addColorStop(0, "rgba(255,255,255,0.10)");
  shade.addColorStop(1, "rgba(0,0,0,0.18)");
  ctx.fillStyle = shade;
  ctx.fillRect(0, 0, size.width, size.height);

  // Caption: up to three lines, centered.
  const fontSize = Math.round(size.width * 0.068);
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, "Segoe UI", sans-serif`;
  ctx.fillStyle = onPrimary;
  ctx.textAlign = "center";
  ctx.textBaseline = "top";
  const lines = wrap(ctx, caption, size.width * 0.84).slice(0, 3);
  const top = size.height * 0.055;
  lines.forEach((line, i) => ctx.fillText(line, size.width / 2, top + i * fontSize * 1.18));

  // The screen, scaled to fit under the caption.
  const areaTop = top + lines.length * fontSize * 1.18 + size.height * 0.035;
  const maxHeight = size.height - areaTop - size.height * 0.04;
  const scale = Math.min((size.width * 0.82) / image.width, maxHeight / image.height);
  const w = image.width * scale;
  const h = image.height * scale;
  const x = (size.width - w) / 2;
  const radius = w * 0.09;
  ctx.save();
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = size.width * 0.04;
  ctx.shadowOffsetY = size.width * 0.012;
  ctx.beginPath();
  ctx.roundRect(x, areaTop, w, h, radius);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x, areaTop, w, h, radius);
  ctx.clip();
  ctx.drawImage(image, x, areaTop, w, h);
  ctx.restore();
  return canvas.toDataURL("image/png");
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines;
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function listingText(listing: StoreListing): string {
  return [
    `Name (App Store, ${STORE_LIMITS.name}): ${listing.name}`,
    `Subtitle (App Store, ${STORE_LIMITS.subtitle}): ${listing.subtitle}`,
    `Promotional text (App Store, ${STORE_LIMITS.promotionalText}): ${listing.promotionalText}`,
    `Keywords (App Store, ${STORE_LIMITS.keywords}): ${listing.keywords}`,
    `Short description (Google Play, ${STORE_LIMITS.shortDescription}): ${listing.shortDescription}`,
    `Category: ${listing.category}`,
    "",
    "Description (both stores):",
    listing.description,
    "",
    "Screenshots:",
    ...listing.screenshots.map((s, i) => `${i + 1}. ${s.caption} (${s.screen})`),
    "",
  ].join("\n");
}

/** The listing the last successful store_listing run wrote. */
async function latestListing(projectId: string): Promise<StoreListing | null> {
  const { runs } = await api<{
    runs: Array<{ id: string; status: string; output: { listing?: StoreListing } | null }>;
  }>(`/api/projects/${projectId}/runs?kind=store_listing`, { quiet: true });
  return runs.find((r) => r.status === "succeeded" && r.output?.listing)?.output?.listing ?? null;
}
