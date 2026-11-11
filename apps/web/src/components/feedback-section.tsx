"use client";

import { useEffect, useState } from "react";
import { Bug, Lightbulb, MessageSquare } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/time-ago";
import { FEEDBACK_SENT_EVENT, openFeedback, type FeedbackKind } from "@/components/feedback-dialog";
import { api } from "@/lib/api";

export type FeedbackStatus = "new" | "planned" | "in_progress" | "done" | "wont_do";

export const STATUS_LABELS: Record<FeedbackStatus, string> = {
  new: "New",
  planned: "Planned",
  in_progress: "In progress",
  done: "Done",
  wont_do: "Won't do",
};

export const KIND_ICONS = { bug: Bug, request: Lightbulb, other: MessageSquare } as const;

interface Report {
  id: string;
  kind: FeedbackKind;
  title: string;
  body: string;
  status: FeedbackStatus;
  reply: string | null;
  images: number;
  createdAt: string;
}

export function StatusBadge({ status }: { status: FeedbackStatus }) {
  return (
    <Badge variant={status === "done" ? "default" : "secondary"} data-testid="feedback-status">
      {STATUS_LABELS[status]}
    </Badge>
  );
}

/** Settings → Your reports: what the user sent, its status and the team's reply. */
export function FeedbackSection() {
  const [reports, setReports] = useState<Report[] | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      api<{ feedback: Report[] }>("/api/feedback", { quiet: true })
        .then((r) => alive && setReports(r.feedback))
        .catch(() => alive && setReports([]));
    void load();
    window.addEventListener(FEEDBACK_SENT_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(FEEDBACK_SENT_EVENT, load);
    };
  }, []);

  return (
    <section id="feedback" data-testid="feedback-section">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold">Your reports</h2>
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => openFeedback({ kind: "bug" })}>
            <Bug /> Report a bug
          </Button>
          <Button size="sm" variant="outline" onClick={() => openFeedback({ kind: "request" })}>
            <Lightbulb /> Request a feature
          </Button>
        </div>
      </div>
      {reports === null ? null : reports.length === 0 ? (
        <p className="rounded-xl border bg-background p-4 text-sm text-muted-foreground">
          Nothing yet. Bugs and ideas you send show up here with their status and our reply.
        </p>
      ) : (
        <ul className="divide-y rounded-xl border bg-background" data-testid="feedback-list">
          {reports.map((r) => {
            const Icon = KIND_ICONS[r.kind];
            return (
              <li key={r.id} className="space-y-2 p-4">
                <div className="flex items-start gap-2">
                  <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{r.title}</div>
                    <div className="text-xs text-muted-foreground">
                      <TimeAgo date={r.createdAt} />
                      {r.images ? ` · ${r.images} screenshot${r.images > 1 ? "s" : ""}` : ""}
                    </div>
                  </div>
                  <StatusBadge status={r.status} />
                </div>
                {r.reply ? (
                  <div
                    className="ml-6 rounded-lg bg-muted px-3 py-2 text-sm whitespace-pre-wrap"
                    data-testid="feedback-reply"
                  >
                    <span className="mb-0.5 block text-xs font-medium text-muted-foreground">
                      Reply from the team
                    </span>
                    {r.reply}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
