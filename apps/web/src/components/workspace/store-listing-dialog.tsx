"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import JSZip from "jszip";
import { Check, Copy, Download, Images, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import {
  buildRouteTree,
  frameStoreShot,
  hostedAppPages,
  readAppPrivacyUrl,
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
  // The icon and screenshots the worker made for App Store Connect, with the listing.
  const [made, setMade] = useState<MadeAssets | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [shots, setShots] = useState<Shot[]>([]);
  const [capturing, setCapturing] = useState<string | null>(null);
  // The pages App Builder hosts for the app; the app's own Privacy link wins when it has one.
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  const pages = origin ? hostedAppPages(origin, projectId) : null;
  const links = {
    privacyUrl: readAppPrivacyUrl(files) || pages?.privacyUrl || "",
    supportUrl: pages?.supportUrl ?? "",
    marketingUrl: pages?.marketingUrl ?? "",
  };

  useEffect(() => {
    if (!open) return;
    let alive = true;
    latestListing(projectId)
      .then((found) => {
        if (!alive || !found) return;
        setListing(found.listing);
        setMade(found.made);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [open, projectId]);

  const progress = useRunStream(runId, async (p) => {
    const found = p.status === "done" ? await latestListing(projectId) : null;
    if (found) {
      setListing(found.listing);
      setMade(found.made);
    }
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
    zip.file("listing.txt", listingText(listing, links));
    // What goes to App Store Connect: the icon and the 6.9" screenshots the worker made.
    if (made) {
      const fetchPng = async (file: string) =>
        (await fetch(assetUrl(projectId, made.runId, file))).arrayBuffer();
      if (made.icon) zip.file("icon.png", await fetchPng(made.icon));
      for (const [index, shot] of made.shots.entries())
        zip.file(
          `app-store-connect/${String(index + 1).padStart(2, "0")}-${slug(shot.caption)}.png`,
          await fetchPng(shot.file),
        );
    }
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[min(84rem,calc(100%-2rem))]">
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
            <div className="grid gap-3 sm:grid-cols-3" data-testid="listing-links">
              <Field
                label="Privacy Policy URL (App Store Connect and Google Play)"
                value={links.privacyUrl}
              />
              <Field label="Support URL (App Store Connect)" value={links.supportUrl} />
              <Field
                label="Marketing URL (App Store Connect) / Website (Google Play)"
                value={links.marketingUrl}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Send to TestFlight fills these links in App Store Connect for you, with any listing
              text you haven&rsquo;t written there yet.
            </p>

            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={() => setCapturing(listing.screenshots[0]?.screen ?? null)}
                disabled={Boolean(capturing) || listing.screenshots.length === 0}
                data-testid="listing-screenshots"
              >
                {capturing ? <Loader2 className="animate-spin" /> : <Images />} Make screenshots
              </Button>
              <Button
                variant="outline"
                onClick={download}
                disabled={!shots.length && !made?.shots.length}
              >
                <Download /> Download all
              </Button>
              {canEdit ? (
                <Button variant="ghost" onClick={write}>
                  <Sparkles /> Write it again
                </Button>
              ) : null}
            </div>

            {made && (made.icon || made.shots.length || made.note) ? (
              <div className="space-y-2 rounded-lg border p-3" data-testid="listing-made">
                <p className="text-xs text-muted-foreground">
                  For App Store Connect: Send to TestFlight builds the app with this icon and
                  uploads these screenshots (6.9&Prime; iPhone).{made.note ? ` ${made.note}` : ""}
                </p>
                <div className="flex gap-3 overflow-x-auto">
                  {made.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={assetUrl(projectId, made.runId, made.icon)}
                      alt="App icon"
                      className="size-20 shrink-0 rounded-[22%] border"
                      data-testid="listing-icon"
                    />
                  ) : null}
                  {made.shots.map((shot) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={shot.file}
                      src={assetUrl(projectId, made.runId, shot.file)}
                      alt={shot.caption}
                      className="h-40 shrink-0 rounded-md border"
                    />
                  ))}
                </div>
              </div>
            ) : null}

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
    <div className="min-w-0 rounded-lg border p-3">
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
      <p className={`text-sm [overflow-wrap:anywhere] ${long ? "whitespace-pre-wrap" : ""}`}>
        {value}
      </p>
    </div>
  );
}

/** One screen rendered off-screen at full device size, captured once it has rendered. */
export function Capturer({
  files,
  screen,
  themeId,
  scale = 3,
  onCaptured,
  onFailed,
}: {
  files: ProjectFiles;
  screen: string;
  themeId?: string;
  /** Pixel ratio of the capture (3 = the device's own). */
  scale?: number;
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
              ?.capture(scale)
              .then(onCaptured)
              .catch((e: Error) => onFailed(e.message));
          }, 1200);
        }}
      />
    </div>,
    document.body,
  );
}

/** A store screenshot at `size`, framed the same way the worker frames the ones it uploads. */
function frame(
  png: string,
  caption: string,
  size: { width: number; height: number },
  theme: PreviewTheme | undefined,
): Promise<string> {
  return frameStoreShot({
    png,
    caption,
    width: size.width,
    height: size.height,
    primary: theme?.colors.primary ?? "#111827",
    onPrimary: theme?.colors.onPrimary ?? "#ffffff",
  });
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);
}

function listingText(
  listing: StoreListing,
  links: { privacyUrl: string; supportUrl: string; marketingUrl: string },
): string {
  return [
    `Name (App Store, ${STORE_LIMITS.name}): ${listing.name}`,
    `Subtitle (App Store, ${STORE_LIMITS.subtitle}): ${listing.subtitle}`,
    `Promotional text (App Store, ${STORE_LIMITS.promotionalText}): ${listing.promotionalText}`,
    `Keywords (App Store, ${STORE_LIMITS.keywords}): ${listing.keywords}`,
    `Short description (Google Play, ${STORE_LIMITS.shortDescription}): ${listing.shortDescription}`,
    `Category: ${listing.category}`,
    `Privacy Policy URL (both stores): ${links.privacyUrl}`,
    `Support URL (App Store): ${links.supportUrl}`,
    `Marketing URL (App Store) / Website (Google Play): ${links.marketingUrl}`,
    "",
    "Description (both stores):",
    listing.description,
    "",
    "Screenshots:",
    ...listing.screenshots.map((s, i) => `${i + 1}. ${s.caption} (${s.screen})`),
    "",
  ].join("\n");
}

interface MadeAssets {
  runId: string;
  icon: string | null;
  shots: Array<{ screen: string; caption: string; file: string }>;
  note: string;
}

function assetUrl(projectId: string, runId: string, file: string): string {
  return `/api/projects/${projectId}/store-assets/${runId}/${file}`;
}

/** The listing the last successful store_listing run wrote, and the assets it made. */
async function latestListing(
  projectId: string,
): Promise<{ listing: StoreListing; made: MadeAssets } | null> {
  const { runs } = await api<{
    runs: Array<{
      id: string;
      status: string;
      output: {
        listing?: StoreListing;
        icon?: string | null;
        shots?: MadeAssets["shots"];
        assetsNote?: string;
      } | null;
    }>;
  }>(`/api/projects/${projectId}/runs?kind=store_listing`, { quiet: true });
  const run = runs.find((r) => r.status === "succeeded" && r.output?.listing);
  if (!run?.output?.listing) return null;
  return {
    listing: run.output.listing,
    made: {
      runId: run.id,
      icon: run.output.icon ?? null,
      shots: run.output.shots ?? [],
      note: run.output.assetsNote ?? "",
    },
  };
}
