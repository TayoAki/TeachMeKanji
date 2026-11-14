"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  ArrowUp,
  Bot,
  Check,
  CircleStop,
  FileCode2,
  Loader2,
  MousePointerClick,
  Palette,
  Smartphone,
  X,
} from "lucide-react";
import { connectorById, type AppPlan } from "@appbuilder/contract/protocol";
import { useHydrated } from "@/hooks/use-hydrated";
import type { RunProgress } from "@/hooks/use-run-stream";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { openFeedback } from "@/components/feedback-dialog";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ChatMessage } from "./types";

/** What the plan card needs to offer mockups before the build. */
export interface PlanDesign {
  available: boolean;
  exists: boolean;
  onDesign: () => void;
}

export interface ChatSelection {
  path: string;
  snippet: string;
  label: string;
  /** A whole screen (picked on the canvas) or one element (picked in the preview). */
  kind: "element" | "screen";
}

/** Which of the app's four parts a screen is (plans made before roles show as tab/screen). */
function partLabel(screen: AppPlan["screens"][number]): string {
  if (screen.role === "onboarding") return "onboarding";
  if (screen.role === "paywall") return "paywall";
  if (screen.role === "settings") return "settings";
  return screen.kind === "tab" ? "tab" : "screen";
}

function offerLabel(offer: AppPlan["monetization"]["offers"][number]): string {
  const per = offer.period === "lifetime" ? " once" : ` / ${offer.period}`;
  return `${offer.label} ${offer.price}${per}${offer.trialDays ? ` (${offer.trialDays}-day trial)` : ""}`;
}

function PlanCard({
  plan,
  number,
  canBuild,
  onBuild,
  building,
  design,
}: {
  plan: AppPlan;
  number?: number;
  canBuild: boolean;
  onBuild: (options?: { skipDesign?: boolean }) => void;
  building: boolean;
  design?: PlanDesign;
}) {
  // A click before hydration would do nothing; keep the button disabled until it works.
  const hydrated = useHydrated();
  return (
    <div className="rounded-xl border bg-background p-3 text-sm shadow-sm" data-testid="plan-card">
      <div className="flex items-center gap-2">
        <span className="font-semibold">{plan.appName}</span>
        {number ? <Badge variant="outline">Plan {number}</Badge> : null}
      </div>
      <p className="mt-1 text-muted-foreground">{plan.summary}</p>
      {plan.audience || plan.coreLoop ? (
        <dl className="mt-2 space-y-0.5 text-xs" data-testid="plan-product">
          {plan.audience ? (
            <div>
              <dt className="inline font-medium">For: </dt>
              <dd className="inline text-muted-foreground">{plan.audience}</dd>
            </div>
          ) : null}
          {plan.coreLoop ? (
            <div>
              <dt className="inline font-medium">Core loop: </dt>
              <dd className="inline text-muted-foreground">{plan.coreLoop}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
      <ol className="mt-3 space-y-2">
        {plan.screens.map((s, i) => (
          <li key={s.key} className="flex gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] font-semibold">
              {i + 1}
            </span>
            <span className="min-w-0">
              <span className="font-medium">{s.title}</span>{" "}
              <span className="text-xs text-muted-foreground">{partLabel(s)}</span>
              <span className="block text-xs text-muted-foreground">{s.purpose}</span>
              {s.role === "paywall" && plan.monetization ? (
                <span className="block text-xs text-muted-foreground">
                  {plan.monetization.offers.map(offerLabel).join(" · ")}
                  {plan.monetization.premiumFeatures.length
                    ? `. Unlocks: ${plan.monetization.premiumFeatures.join(", ")}`
                    : ""}
                </span>
              ) : null}
            </span>
          </li>
        ))}
      </ol>
      {plan.collections.length ? (
        <p className="mt-3 text-xs text-muted-foreground">
          Data:{" "}
          {plan.collections
            .map((c) => `${c.name} (${c.fields.map((f) => f.name).join(", ")})`)
            .join("; ")}
        </p>
      ) : null}
      <div className="mt-3 flex items-center gap-1.5">
        {plan.themes.map((t) => (
          <span
            key={t.id}
            title={`${t.name}: ${t.mood}`}
            className="size-4 rounded-full border"
            style={{ backgroundColor: t.primary }}
          />
        ))}
        <span className="ml-1 text-xs text-muted-foreground">5 themes</span>
      </div>
      {canBuild && design?.available && !design.exists ? (
        <div className="mt-3 flex flex-col gap-1.5">
          <Button
            size="sm"
            onClick={design.onDesign}
            disabled={building || !hydrated}
            data-testid="design-screens"
          >
            {building ? <Loader2 className="animate-spin" /> : <Palette />} Design my screens
          </Button>
          <span className="text-center text-[11px] text-muted-foreground">
            See a mockup of every screen and approve it before anything is built.
          </span>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 text-xs"
            onClick={() => onBuild({ skipDesign: true })}
            disabled={building || !hydrated}
            data-testid="confirm-build"
          >
            Skip mockups and build now
          </Button>
        </div>
      ) : canBuild && design?.exists ? (
        <p className="mt-3 text-center text-[11px] text-muted-foreground">
          Review the mockups on the canvas, then build.
        </p>
      ) : canBuild ? (
        <div className="mt-3 flex flex-col gap-1.5">
          <Button
            size="sm"
            onClick={() => onBuild()}
            disabled={building || !hydrated}
            data-testid="confirm-build"
          >
            {building ? <Loader2 className="animate-spin" /> : <Check />} Confirm & build
          </Button>
          <span className="text-center text-[11px] text-muted-foreground">
            Or reply below to change the plan.
          </span>
        </div>
      ) : null}
    </div>
  );
}

function RunCard({ progress, onCancel }: { progress: RunProgress; onCancel: () => void }) {
  const done = progress.written.length;
  return (
    <div
      className="rounded-xl border border-dashed bg-background p-3 text-sm"
      data-testid="run-progress"
    >
      <div className="flex items-center gap-2">
        <Loader2 className="size-4 animate-spin text-primary" />
        <span className="font-medium">{progress.step ?? "Starting…"}</span>
      </div>
      {done > 0 ? (
        <ul className="mt-2 max-h-40 space-y-1 overflow-auto font-mono text-[11px] text-muted-foreground">
          {progress.written.map((f, i) => (
            <li key={`${f.path}-${i}`} className="flex items-center gap-1.5">
              <FileCode2 className="size-3" /> {f.path}{" "}
              <span className="ml-auto">{f.lines} lines</span>
            </li>
          ))}
        </ul>
      ) : null}
      {progress.offline ? (
        <p className="mt-2 text-[11px] text-amber-700">
          Offline template generator (no AI provider configured).
        </p>
      ) : null}
      <Button variant="ghost" size="sm" className="mt-2 h-7 px-2 text-xs" onClick={onCancel}>
        <CircleStop /> Stop
      </Button>
    </div>
  );
}

export function ChatPanel({
  messages,
  latestPlanId,
  canBuild,
  readOnly,
  progress,
  busy,
  selection,
  onClearSelection,
  onSend,
  onBuild,
  onCancel,
  design,
  currentVersionId = null,
  onUndo,
  userInitial = "Y",
}: {
  userInitial?: string;
  /** The app's current version: only the latest AI edit offers "Undo this edit". */
  currentVersionId?: string | null;
  /** Restore the version before an AI edit. */
  onUndo?: (toVersionId: string) => Promise<void>;
  messages: ChatMessage[];
  latestPlanId: string | null;
  canBuild: boolean;
  readOnly: boolean;
  progress: RunProgress | null;
  busy: boolean;
  selection: ChatSelection | null;
  onClearSelection: () => void;
  onSend: (text: string) => Promise<boolean>;
  onBuild: (options?: { skipDesign?: boolean }) => void;
  onCancel: () => void;
  /** The design-first step for the latest plan (mockups before the build). */
  design?: PlanDesign;
}) {
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const connected = useConnectedNames(!readOnly);
  const end = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [messages.length, progress?.step, progress?.written.length]);

  useEffect(() => {
    if (selection) input.current?.focus();
  }, [selection]);

  const send = async () => {
    const value = text.trim();
    if (!value || sending || busy) return;
    setSending(true);
    const ok = await onSend(value);
    setSending(false);
    if (ok) setText("");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-3" data-testid="chat-messages">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn("flex gap-2", m.role === "user" && "flex-row-reverse")}
            data-testid={`chat-${m.role}`}
          >
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
              )}
            >
              {m.role === "user" ? userInitial : <Bot className="size-4" />}
            </span>
            <div className={cn("min-w-0 max-w-[85%]", m.role === "user" && "text-right")}>
              {m.kind === "plan" && m.content.plan ? (
                <PlanCard
                  plan={m.content.plan}
                  number={m.content.number}
                  canBuild={canBuild && m.content.planId === latestPlanId}
                  onBuild={onBuild}
                  building={busy}
                  design={design}
                />
              ) : (
                <div
                  className={cn(
                    "inline-block whitespace-pre-wrap rounded-2xl px-3 py-2 text-left text-sm",
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted",
                    m.kind === "error" &&
                      "border border-destructive/30 bg-destructive/10 text-destructive",
                  )}
                >
                  {m.kind === "error" ? <AlertTriangle className="mr-1 inline size-4" /> : null}
                  {m.content.text}
                  {m.kind === "error" ? (
                    <button
                      type="button"
                      className="mt-1 block text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
                      onClick={() =>
                        openFeedback({
                          kind: "bug",
                          title: "A step failed in my project",
                          body: `The chat said: "${String(m.content.text ?? "").slice(0, 300)}"\n\nWhat I was doing: `,
                        })
                      }
                      data-testid="report-error"
                    >
                      Report this
                    </button>
                  ) : null}
                  {onUndo &&
                  !readOnly &&
                  !busy &&
                  m.role === "assistant" &&
                  m.content.undoVersionId &&
                  m.content.versionId &&
                  m.content.versionId === currentVersionId ? (
                    <button
                      type="button"
                      className="mt-1 block text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
                      onClick={() => void onUndo(m.content.undoVersionId!).catch(() => {})}
                      title="Go back to the version before this edit. Within 24 hours its credits come back."
                      data-testid="undo-edit"
                    >
                      Undo this edit (credits back)
                    </button>
                  ) : null}
                  {m.content.test?.length ? (
                    <ul className="mt-2 space-y-1 text-xs" data-testid="walkthrough">
                      {m.content.test.map((t) => (
                        <li key={t.title} className="flex items-start gap-1.5" title={t.observed}>
                          {t.status === "pass" ? (
                            <Check className="mt-0.5 size-3.5 shrink-0 text-emerald-600" />
                          ) : t.status === "blocked" ? (
                            <Smartphone className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                          ) : (
                            <X className="mt-0.5 size-3.5 shrink-0 text-destructive" />
                          )}
                          <span>
                            {t.title}
                            {t.fixed ? <span className="opacity-70"> (fixed)</span> : null}
                            {t.status === "blocked" ? (
                              <span className="opacity-70"> (needs a phone)</span>
                            ) : null}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  {m.content.selection ? (
                    <span className="mt-1 block font-mono text-[10px] opacity-75">
                      on {m.content.selection.path}
                    </span>
                  ) : null}
                  {m.content.assetIds?.length ? (
                    <span className="mt-2 flex flex-wrap justify-end gap-1">
                      {m.content.assetIds.map((id) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={id}
                          src={`/api/assets/${id}`}
                          alt="Reference"
                          className="size-12 rounded-md border object-cover"
                        />
                      ))}
                    </span>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        ))}
        {progress && progress.status === "running" ? (
          <RunCard progress={progress} onCancel={onCancel} />
        ) : null}
        <div ref={end} />
      </div>
      {readOnly ? (
        <div className="border-t p-3 text-center text-xs text-muted-foreground">
          You can view this project but not edit it.
        </div>
      ) : (
        <div className="border-t p-3">
          {selection ? (
            <div
              className="mb-2 flex items-center gap-2 rounded-lg bg-primary/10 px-2 py-1 text-xs"
              data-testid="chat-selection"
            >
              <MousePointerClick className="size-3.5" />
              <span className="truncate">Editing: {selection.label}</span>
              <button
                type="button"
                aria-label="Clear selection"
                className="ml-auto"
                onClick={onClearSelection}
              >
                <X className="size-3.5" />
              </button>
            </div>
          ) : null}
          <div className="rounded-xl border bg-background p-2 focus-within:ring-2 focus-within:ring-ring/40">
            <Textarea
              ref={input}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send();
                }
              }}
              placeholder={
                canBuild
                  ? "Ask for changes to the plan…"
                  : selection?.kind === "screen"
                    ? `What should change on the ${selection.label}?`
                    : "Describe a change…"
              }
              className="min-h-16 resize-none border-0 p-1 text-sm shadow-none focus-visible:ring-0"
              aria-label="Message the agent"
              disabled={busy}
            />
            <div className="flex items-center justify-between">
              <span className="truncate text-[11px] text-muted-foreground">
                {busy ? "Working…" : "Enter to send"}
                {!busy && connected.length ? (
                  <span
                    title="Name a connected tool in your message and the agent reads from it first"
                    data-testid="chat-connectors"
                  >
                    {" "}
                    · {connected.join(", ")} connected
                  </span>
                ) : null}
              </span>
              <Button
                size="icon"
                className="size-8 rounded-full"
                onClick={send}
                disabled={!text.trim() || busy || sending}
                aria-label="Send"
                data-testid="chat-send"
              >
                {sending ? <Loader2 className="animate-spin" /> : <ArrowUp />}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/** Names of the viewer's connected connectors, for the composer hint. */
function useConnectedNames(enabled: boolean): string[] {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void api<{ connected: Array<{ provider: string }> }>("/api/connectors", { quiet: true })
      .then(({ connected }) => {
        if (cancelled) return;
        setNames(
          connected
            .map((c) => connectorById(c.provider)?.name)
            .filter((name): name is string => Boolean(name)),
        );
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [enabled]);
  return names;
}
