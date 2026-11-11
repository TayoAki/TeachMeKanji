"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Palette, RefreshCw, Sparkles, X } from "lucide-react";
import type { DesignView } from "@appbuilder/contract/protocol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

type Item = DesignView["screens"][number];
type Status = Item["status"];

const STATUS: Record<Status, { label: string; className: string }> = {
  pending: { label: "To review", className: "bg-muted text-muted-foreground" },
  approved: {
    label: "Approved",
    className: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  },
  changes: {
    label: "Change asked",
    className: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
  },
};

/**
 * Mockups before the build: every screen (and the mascot) drawn from the plan, which the user
 * approves or asks to change. Shown on the canvas until the app is built.
 */
export function DesignReview({
  projectId,
  design,
  canEdit,
  busy,
  onDesignChange,
  onStartRun,
  onBuild,
}: {
  projectId: string;
  design: DesignView;
  canEdit: boolean;
  /** A run (drawing, redrawing or building) is in progress. */
  busy: boolean;
  onDesignChange: (design: DesignView | null) => void;
  onStartRun: (runId: string) => void;
  onBuild: () => Promise<void>;
}) {
  const [viewing, setViewing] = useState<{ url: string; title: string } | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const drawing = design.status === "generating";

  // New mockups appear as they're drawn: check every few seconds while anything is running.
  useEffect(() => {
    if (!drawing && !busy) return;
    const timer = setInterval(() => {
      api<{ design: DesignView | null }>(`/api/projects/${projectId}/design`, { quiet: true })
        .then((r) => onDesignChange(r.design))
        .catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [drawing, busy, projectId, onDesignChange]);

  const review = async (path: string, status: "approved" | "changes", note?: string) => {
    setWorking(path);
    try {
      const r = await api<{ design: DesignView | null }>(`/api/projects/${projectId}/design`, {
        method: "PATCH",
        json: { path, status, note },
      });
      onDesignChange(r.design);
    } finally {
      setWorking(null);
    }
  };

  const redraw = async (path: string, note: string) => {
    setWorking(path);
    try {
      const r = await api<{ runId: string }>(`/api/projects/${projectId}/design/redo`, {
        method: "POST",
        json: { path, note },
      });
      onStartRun(r.runId);
      const fresh = await api<{ design: DesignView | null }>(`/api/projects/${projectId}/design`, {
        quiet: true,
      });
      onDesignChange(fresh.design);
    } finally {
      setWorking(null);
    }
  };

  const approveAllAndBuild = async () => {
    setWorking("all");
    try {
      if (!design.approved) {
        const r = await api<{ design: DesignView | null }>(`/api/projects/${projectId}/design`, {
          method: "PATCH",
          json: { approveAll: true },
        });
        onDesignChange(r.design);
      }
      await onBuild();
    } finally {
      setWorking(null);
    }
  };

  const retry = async () => {
    setWorking("retry");
    try {
      const r = await api<{ runId: string }>(`/api/projects/${projectId}/design`, {
        method: "POST",
      });
      onStartRun(r.runId);
      const fresh = await api<{ design: DesignView | null }>(`/api/projects/${projectId}/design`, {
        quiet: true,
      });
      onDesignChange(fresh.design);
    } finally {
      setWorking(null);
    }
  };

  const drawn = design.screens.filter((s) => s.url).length;
  const toReview =
    design.screens.filter((s) => s.status !== "approved").length +
    (design.mascot && design.mascot.status !== "approved" ? 1 : 0);

  return (
    <div className="h-full overflow-y-auto bg-muted/30" data-testid="design-review">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-6 py-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0 space-y-1">
            <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              <Palette className="size-3.5" /> Mockups before the build
            </p>
            <h2 className="text-xl font-semibold">
              {design.styleName ? `“${design.styleName}”` : "Designing your app"}
            </h2>
            {design.summary ? (
              <p className="max-w-2xl text-sm text-muted-foreground">{design.summary}</p>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs text-muted-foreground">
              {design.palette
                ? Object.values(design.palette).map((color, i) => (
                    <span
                      key={i}
                      className="size-4 rounded-full border"
                      style={{ backgroundColor: color }}
                    />
                  ))
                : null}
              {design.fonts ? <span>{design.fonts}</span> : null}
              {design.signature ? <span>· Signature moment: {design.signature}</span> : null}
            </div>
          </div>
          {canEdit && design.status === "ready" ? (
            <div className="flex flex-col items-end gap-1">
              <Button
                onClick={approveAllAndBuild}
                disabled={busy || working !== null}
                data-testid="design-approve-all"
              >
                {working === "all" ? <Loader2 className="animate-spin" /> : <Sparkles />}
                {design.approved ? "Build from these mockups" : "Approve all & build"}
              </Button>
              <span className="text-[11px] text-muted-foreground">
                {toReview === 0
                  ? "Everything is approved."
                  : `${toReview} left to review. Building approves them all.`}
              </span>
            </div>
          ) : null}
        </header>

        <p className="text-sm text-muted-foreground" data-testid="design-status">
          {drawing
            ? `Drawing your mockups… ${drawn} of ${design.screens.length || "?"} screens so far.`
            : design.status === "failed"
              ? (design.error ?? "Drawing the mockups failed.")
              : "Approve each screen, or ask for a change and say what you want. Each change is redrawn in under a minute."}
        </p>
        {design.status === "failed" && canEdit ? (
          <div>
            <Button variant="outline" onClick={retry} disabled={busy || working !== null}>
              <RefreshCw /> Try again
            </Button>
          </div>
        ) : null}

        {design.mascot ? (
          <section className="rounded-xl border bg-background p-4" data-testid="mascot-card">
            <div className="mb-3 flex items-center justify-between gap-2">
              <h3 className="font-medium">Mascot: {design.mascot.name}</h3>
              <StatusPill status={design.mascot.status} />
            </div>
            <div className="flex gap-3 overflow-x-auto pb-1">
              {design.mascot.poses.map((pose) => (
                <figure
                  key={pose.name}
                  className="w-28 shrink-0 text-center text-xs text-muted-foreground"
                >
                  {pose.url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={pose.url}
                      alt={`${design.mascot!.name}, ${pose.name}`}
                      className="size-28 rounded-lg object-contain [background:repeating-conic-gradient(var(--color-muted)_0_25%,transparent_0_50%)_0_0/16px_16px]"
                    />
                  ) : (
                    <Placeholder drawing={drawing || busy} className="size-28" />
                  )}
                  <figcaption className="mt-1">{pose.name}</figcaption>
                </figure>
              ))}
            </div>
            {canEdit && design.status === "ready" ? (
              <Review
                path="mascot"
                status={design.mascot.status}
                note={design.mascot.note}
                disabled={busy || working !== null}
                working={working === "mascot"}
                onApprove={() => review("mascot", "approved")}
                onRedraw={(note) => redraw("mascot", note)}
              />
            ) : null}
          </section>
        ) : null}

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
          {design.screens.map((screen) => (
            <article
              key={screen.path}
              className="flex min-w-0 flex-col gap-2"
              data-testid="design-card"
              data-path={screen.path}
            >
              {screen.url ? (
                <button
                  type="button"
                  className="overflow-hidden rounded-2xl border bg-background"
                  onClick={() => setViewing({ url: screen.url!, title: screen.title })}
                  aria-label={`Open the ${screen.title} mockup larger`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={screen.url}
                    alt={`${screen.title} mockup`}
                    className="aspect-[9/16] w-full object-cover"
                  />
                </button>
              ) : (
                <Placeholder drawing={drawing || busy} className="aspect-[9/16] w-full" />
              )}
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-medium">{screen.title}</h3>
                <StatusPill status={screen.status} />
              </div>
              {canEdit && design.status === "ready" && screen.url ? (
                <Review
                  path={screen.path}
                  status={screen.status}
                  note={screen.note}
                  disabled={busy || working !== null}
                  working={working === screen.path}
                  onApprove={() => review(screen.path, "approved")}
                  onRedraw={(note) => redraw(screen.path, note)}
                />
              ) : null}
            </article>
          ))}
        </div>
      </div>

      {viewing ? (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-background/90 p-6"
          role="dialog"
          aria-modal="true"
          aria-label={`${viewing.title} mockup`}
          onClick={() => setViewing(null)}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={viewing.url}
            alt={`${viewing.title} mockup`}
            className="max-h-full max-w-full rounded-3xl border"
          />
          <Button
            variant="outline"
            size="sm"
            className="absolute right-4 top-4"
            onClick={() => setViewing(null)}
          >
            <X /> Close
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: Status }) {
  return (
    <Badge
      variant="secondary"
      className={cn("shrink-0 font-medium", STATUS[status].className)}
      data-testid="design-item-status"
    >
      {STATUS[status].label}
    </Badge>
  );
}

function Placeholder({ drawing, className }: { drawing: boolean; className?: string }) {
  return (
    <div
      className={cn(
        "grid place-items-center rounded-2xl border border-dashed bg-background text-xs text-muted-foreground",
        className,
      )}
    >
      {drawing ? (
        <span className="flex items-center gap-1.5">
          <Loader2 className="size-3.5 animate-spin" /> Drawing…
        </span>
      ) : (
        "Not drawn"
      )}
    </div>
  );
}

function Review({
  path,
  status,
  note,
  disabled,
  working,
  onApprove,
  onRedraw,
}: {
  path: string;
  status: Status;
  note: string;
  disabled: boolean;
  working: boolean;
  onApprove: () => void;
  onRedraw: (note: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState(note);
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-1.5">
        <Button
          size="sm"
          variant={status === "approved" ? "default" : "outline"}
          className="h-8 flex-1 px-2 text-xs"
          onClick={onApprove}
          disabled={disabled}
          aria-pressed={status === "approved"}
          data-testid="design-approve"
        >
          {working && !open ? <Loader2 className="animate-spin" /> : <Check />} Approve
        </Button>
        <Button
          size="sm"
          variant={open ? "secondary" : "outline"}
          className="h-8 flex-1 px-2 text-xs"
          onClick={() => setOpen((o) => !o)}
          disabled={disabled}
          aria-expanded={open}
          data-testid="design-change"
        >
          Ask for a change
        </Button>
      </div>
      {open ? (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim().length >= 3) {
              onRedraw(text.trim());
              setOpen(false);
            }
          }}
        >
          <label htmlFor={`note-${path}`} className="sr-only">
            What should change?
          </label>
          <Textarea
            id={`note-${path}`}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="For example: a warmer palette, a bigger progress ring, no hat on the mascot"
            className="min-h-16 text-xs"
            maxLength={500}
            data-testid="design-note"
          />
          <Button
            type="submit"
            size="sm"
            className="h-8 text-xs"
            disabled={disabled || text.trim().length < 3}
            data-testid="design-redo"
          >
            <RefreshCw /> Redraw with this change
          </Button>
        </form>
      ) : null}
    </div>
  );
}
