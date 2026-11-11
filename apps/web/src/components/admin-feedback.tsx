"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { TimeAgo } from "@/components/time-ago";
import {
  KIND_ICONS,
  STATUS_LABELS,
  StatusBadge,
  type FeedbackStatus,
} from "@/components/feedback-section";
import type { FeedbackKind } from "@/components/feedback-dialog";
import { api } from "@/lib/api";

interface Item {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  status: FeedbackStatus;
  reply: string | null;
  images: number;
  projectId: string | null;
  projectName: string | null;
  context: {
    path?: string;
    userAgent?: string;
    viewport?: string;
    errors?: string[];
    lastFailedRun?: { kind: string; error: string; at: string };
    build?: string;
  };
  user: { email: string; name: string };
  createdAt: string;
}

const STATUSES = Object.keys(STATUS_LABELS) as FeedbackStatus[];

/** The operator's triage list: filter, read the context, set a status and reply. */
export function AdminFeedback() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [status, setStatus] = useState<FeedbackStatus | "">("new");
  const [kind, setKind] = useState<FeedbackKind | "">("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({
      ...(status ? { status } : {}),
      ...(kind ? { kind } : {}),
    });
    return (await api<{ feedback: Item[] }>(`/api/admin/feedback?${params}`)).feedback;
  }, [status, kind]);

  useEffect(() => {
    let alive = true;
    void load()
      .then((found) => alive && setItems(found))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6" data-testid="admin-feedback">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold">Feedback</h1>
          <p className="text-sm text-muted-foreground">
            Bug reports and feature requests. Senders see the status and your reply in Settings, and
            get an email when they change (with email set up).
          </p>
        </div>
        <div className="flex gap-2 text-sm">
          <select
            className="rounded-md border bg-background px-2 py-1"
            value={status}
            onChange={(e) => setStatus(e.target.value as FeedbackStatus | "")}
            aria-label="Status"
          >
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            className="rounded-md border bg-background px-2 py-1"
            value={kind}
            onChange={(e) => setKind(e.target.value as FeedbackKind | "")}
            aria-label="Kind"
          >
            <option value="">Bugs and requests</option>
            <option value="bug">Bugs</option>
            <option value="request">Feature requests</option>
            <option value="other">Other</option>
          </select>
        </div>
      </div>
      {items === null ? (
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      ) : items.length === 0 ? (
        <p className="rounded-xl border p-6 text-sm text-muted-foreground">Nothing here.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <AdminItem
              key={item.id}
              item={item}
              onSaved={(next) =>
                setItems(
                  (all) => all?.map((i) => (i.id === next.id ? { ...i, ...next } : i)) ?? null,
                )
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function AdminItem({
  item,
  onSaved,
}: {
  item: Item;
  onSaved: (next: { id: string; status: FeedbackStatus; reply: string | null }) => void;
}) {
  const [status, setStatus] = useState(item.status);
  const [reply, setReply] = useState(item.reply ?? "");
  const [busy, setBusy] = useState(false);
  const Icon = KIND_ICONS[item.kind];
  const dirty = status !== item.status || reply !== (item.reply ?? "");

  const save = async () => {
    setBusy(true);
    try {
      const next = await api<{ id: string; status: FeedbackStatus; reply: string | null }>(
        `/api/admin/feedback/${item.id}`,
        { method: "PATCH", json: { status, reply } },
      );
      onSaved(next);
      toast.success("Saved");
    } catch {
      // api() already showed the error.
    } finally {
      setBusy(false);
    }
  };

  const c = item.context;
  return (
    <li
      id={item.id}
      className="space-y-3 rounded-xl border bg-background p-4"
      data-testid="admin-item"
    >
      <div className="flex items-start gap-2">
        <Icon className="mt-1 size-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0 flex-1">
          <div className="font-medium">{item.title}</div>
          <div className="text-xs text-muted-foreground">
            {item.user.name} · {item.user.email} · <TimeAgo date={item.createdAt} />
            {item.projectName ? ` · ${item.projectName}` : ""}
          </div>
        </div>
        <StatusBadge status={item.status} />
      </div>
      <p className="whitespace-pre-wrap text-sm">{item.body}</p>
      {item.images ? (
        <div className="flex flex-wrap gap-2">
          {Array.from({ length: item.images }, (_, i) => (
            <a
              key={i}
              href={`/api/feedback/${item.id}/images/${i}`}
              target="_blank"
              rel="noreferrer"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/feedback/${item.id}/images/${i}`}
                alt={`Screenshot ${i + 1}`}
                className="h-28 rounded-md border object-cover"
              />
            </a>
          ))}
        </div>
      ) : null}
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Technical details</summary>
        <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 [overflow-wrap:anywhere]">
          {c.path ? <Row label="Page" value={c.path} /> : null}
          {item.projectId ? <Row label="Project" value={item.projectId} /> : null}
          {c.viewport ? <Row label="Window" value={c.viewport} /> : null}
          {c.userAgent ? <Row label="Browser" value={c.userAgent} /> : null}
          {c.build ? <Row label="Build" value={c.build} /> : null}
          {c.lastFailedRun ? (
            <Row
              label="Last failed step"
              value={`${c.lastFailedRun.kind} at ${c.lastFailedRun.at}: ${c.lastFailedRun.error}`}
            />
          ) : null}
          {c.errors?.length ? <Row label="Recent errors" value={c.errors.join("\n")} /> : null}
        </dl>
      </details>
      <div className="flex flex-col gap-2 border-t pt-3 sm:flex-row sm:items-start">
        <select
          className="rounded-md border bg-background px-2 py-1 text-sm"
          value={status}
          onChange={(e) => setStatus(e.target.value as FeedbackStatus)}
          aria-label={`Status of ${item.title}`}
        >
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <Textarea
          value={reply}
          onChange={(e) => setReply(e.target.value)}
          rows={2}
          maxLength={5000}
          placeholder="Reply to the sender (optional; they see it in Settings)"
          className="flex-1 text-sm"
          aria-label={`Reply to ${item.title}`}
        />
        <Button onClick={save} disabled={!dirty || busy} className="shrink-0">
          {busy ? <Loader2 className="animate-spin" /> : null} Save
        </Button>
      </div>
    </li>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="font-medium">{label}</dt>
      <dd className="whitespace-pre-wrap font-mono">{value}</dd>
    </>
  );
}
