"use client";

import { useCallback, useEffect, useState } from "react";
import { Bug, Check, ChevronDown, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/time-ago";
import { api } from "@/lib/api";

interface AppErrorItem {
  id: string;
  message: string;
  stack: string | null;
  screen: string | null;
  platform: string;
  fatal: boolean;
  test: boolean;
  count: number;
  firstSeen: string;
  lastSeen: string;
  resolved: boolean;
}

const PLATFORM_LABEL: Record<string, string> = { ios: "iPhone", android: "Android", web: "Web" };

/** What the AI is asked when the owner clicks "Fix with AI" (the agent also sees the stack). */
export function fixRequestFor(errors: AppErrorItem[]): string {
  const list = errors
    .map((e) => `"${e.message.slice(0, 200)}"${e.screen ? ` on ${e.screen}` : ""}`)
    .join("; ");
  return errors.length === 1
    ? `Fix this error people hit in the app: ${list}.`
    : `Fix these errors people hit in the app: ${list}.`;
}

/**
 * The Errors tab: what went wrong on phones running the app (TestFlight, store builds and Expo
 * Go), grouped and counted. "Fix with AI" sends the error to the chat agent, which also reads the
 * open errors before every edit.
 */
export function ErrorsView({
  projectId,
  canEdit,
  busy,
  refreshKey,
  onFix,
}: {
  projectId: string;
  canEdit: boolean;
  busy: boolean;
  refreshKey: string | null;
  onFix: (text: string, errorIds: string[]) => Promise<void>;
}) {
  const [errors, setErrors] = useState<AppErrorItem[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(
    () =>
      api<{ errors: AppErrorItem[] }>(`/api/projects/${projectId}/errors`, { quiet: true })
        .then((r) => setErrors(r.errors))
        .catch(() => setErrors([])),
    [projectId],
  );
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const dismiss = async (ids: string[]) => {
    await api(`/api/projects/${projectId}/errors`, { method: "POST", json: { resolve: ids } });
    toast.success(ids.length === 1 ? "Marked as fixed" : `Marked ${ids.length} as fixed`);
    void load();
  };

  if (!errors) return <div className="p-6 text-sm text-muted-foreground">Loading errors…</div>;
  const active = errors.filter((e) => !e.resolved);
  const fixed = errors.filter((e) => e.resolved);

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-6" data-testid="errors-view">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Bug className="size-4" /> Errors from phones
          </h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            When the app hits a problem on someone&apos;s phone (a TestFlight or store build, or
            Expo Go), it reports the message, the screen and the device type here. No names, emails
            or data. The AI reads open errors before every change.
          </p>
        </div>
        {canEdit && active.length > 1 ? (
          <Button
            size="sm"
            disabled={busy}
            onClick={() =>
              void onFix(
                fixRequestFor(active.slice(0, 5)),
                active.slice(0, 5).map((e) => e.id),
              )
            }
            data-testid="fix-all-errors"
          >
            <Sparkles /> Fix the top {Math.min(active.length, 5)} with AI
          </Button>
        ) : null}
      </div>

      {active.length === 0 ? (
        <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
          No open errors. Errors appear here once the app runs on a phone and something goes wrong.
        </div>
      ) : (
        <ul className="space-y-2">
          {active.map((e) => (
            <li key={e.id} className="rounded-lg border bg-background p-3" data-testid="app-error">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    className="flex w-full items-start gap-1 text-left"
                    onClick={() => setOpen(open === e.id ? null : e.id)}
                    aria-expanded={open === e.id}
                  >
                    <ChevronDown
                      className={`mt-0.5 size-4 shrink-0 transition-transform ${open === e.id ? "" : "-rotate-90"}`}
                    />
                    <span className="break-words font-mono text-sm">{e.message}</span>
                  </button>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 pl-5 text-xs text-muted-foreground">
                    {e.fatal ? <Badge variant="destructive">Crash</Badge> : null}
                    {e.test ? <Badge variant="outline">Test device</Badge> : null}
                    <span className="tabular-nums">{e.count}×</span>
                    <span>· {PLATFORM_LABEL[e.platform] ?? e.platform}</span>
                    {e.screen ? <span className="font-mono">· {e.screen}</span> : null}
                    <span>
                      · last <TimeAgo date={e.lastSeen} />
                    </span>
                  </div>
                  {open === e.id && e.stack ? (
                    <pre className="mt-2 max-h-48 overflow-auto rounded-md bg-muted p-2 text-[11px] leading-relaxed">
                      {e.stack}
                    </pre>
                  ) : null}
                </div>
                {canEdit ? (
                  <div className="flex shrink-0 gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => void onFix(fixRequestFor([e]), [e.id])}
                      data-testid="fix-error"
                    >
                      <Sparkles /> Fix with AI
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => void dismiss([e.id])}
                      title="Mark as fixed (a new report reopens it)"
                      aria-label="Mark as fixed"
                    >
                      <Check />
                    </Button>
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {fixed.length ? (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            {fixed.length} fixed or dismissed
          </summary>
          <ul className="mt-2 space-y-1">
            {fixed.map((e) => (
              <li key={e.id} className="truncate font-mono text-xs text-muted-foreground">
                {e.message}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
