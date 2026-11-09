"use client";

import { useEffect, useMemo, useState } from "react";
import { Copy, FileCode2, Folder, History, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import type { ProjectFiles } from "@appbuilder/contract/protocol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { cn, timeAgo } from "@/lib/utils";

/** Remount with a new `key` to focus another file (e.g. the selected element's file). */
export function CodeView({ files, focusPath }: { files: ProjectFiles; focusPath?: string | null }) {
  const paths = useMemo(() => Object.keys(files).sort(), [files]);
  const [current, setCurrent] = useState<string | null>(focusPath ?? null);
  const selected =
    current && files[current] !== undefined
      ? current
      : (paths.find((p) => p === "app/(tabs)/index.tsx") ?? paths[0]);

  if (paths.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        The code appears here after the first build.
      </div>
    );
  }
  const groups = new Map<string, string[]>();
  for (const p of paths) {
    const dir = p.includes("/") ? p.slice(0, p.lastIndexOf("/")) : ".";
    groups.set(dir, [...(groups.get(dir) ?? []), p]);
  }
  const lines = (files[selected!] ?? "").split("\n");

  return (
    <div className="flex h-full min-h-0" data-testid="code-view">
      <nav className="w-60 shrink-0 overflow-auto border-r p-2 text-sm">
        {[...groups.entries()].map(([dir, items]) => (
          <div key={dir} className="mb-2">
            <div className="flex items-center gap-1.5 px-2 py-1 text-xs text-muted-foreground">
              <Folder className="size-3.5" /> {dir}
            </div>
            {items.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setCurrent(p)}
                className={cn(
                  "flex w-full items-center gap-1.5 truncate rounded px-2 py-1 pl-6 text-left hover:bg-accent",
                  p === selected && "bg-accent font-medium",
                )}
              >
                <FileCode2 className="size-3.5 shrink-0" />{" "}
                <span className="truncate">{p.split("/").pop()}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 items-center gap-2 border-b px-3 font-mono text-xs">
          {selected}
          <Button
            variant="ghost"
            size="sm"
            className="ml-auto h-7"
            onClick={() =>
              navigator.clipboard
                .writeText(files[selected!] ?? "")
                .then(() => toast.success("Copied"))
            }
          >
            <Copy /> Copy
          </Button>
        </div>
        <pre
          className="min-h-0 flex-1 overflow-auto bg-muted/30 py-2 font-mono text-xs leading-5"
          data-testid="code-content"
        >
          {lines.map((line, i) => (
            <div key={i} className="flex">
              <span className="w-12 shrink-0 select-none pr-3 text-right text-muted-foreground/60">
                {i + 1}
              </span>
              <span className="whitespace-pre pr-4">{line}</span>
            </div>
          ))}
        </pre>
      </div>
    </div>
  );
}

interface VersionRow {
  id: string;
  number: number;
  kind: "generate" | "ai_edit" | "inline_edit" | "restore";
  summary: string;
  createdAt: string;
}

const KIND_LABEL: Record<VersionRow["kind"], string> = {
  generate: "Build",
  ai_edit: "AI edit",
  inline_edit: "Inspector",
  restore: "Restore",
};

export function HistoryView({
  projectId,
  currentVersionId,
  canEdit,
  onRestored,
}: {
  projectId: string;
  currentVersionId: string | null;
  canEdit: boolean;
  onRestored: () => void;
}) {
  const [versions, setVersions] = useState<VersionRow[] | null>(null);
  useEffect(() => {
    api<{ versions: VersionRow[] }>(`/api/projects/${projectId}/versions`, { quiet: true })
      .then((r) => setVersions(r.versions))
      .catch(() => setVersions([]));
  }, [projectId, currentVersionId]);

  const restore = async (v: VersionRow) => {
    await api(`/api/projects/${projectId}/versions/${v.id}/restore`, { method: "POST" });
    toast.success(`Restored version ${v.number}`);
    onRestored();
  };

  if (!versions) return <div className="p-6 text-sm text-muted-foreground">Loading history…</div>;
  if (versions.length === 0)
    return <div className="p-6 text-sm text-muted-foreground">No versions yet.</div>;
  return (
    <ol className="mx-auto max-w-2xl space-y-2 p-6" data-testid="history">
      {versions.map((v) => (
        <li key={v.id} className="flex items-center gap-3 rounded-lg border bg-background p-3">
          <History className="size-4 text-muted-foreground" />
          <span className="w-8 text-sm font-semibold tabular-nums">v{v.number}</span>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm">{v.summary}</div>
            <div className="text-xs text-muted-foreground">{timeAgo(v.createdAt)}</div>
          </div>
          <Badge variant="outline">{KIND_LABEL[v.kind]}</Badge>
          {v.id === currentVersionId ? (
            <Badge>Current</Badge>
          ) : canEdit ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => restore(v)}
              data-testid={`restore-v${v.number}`}
            >
              <RotateCcw /> Restore
            </Button>
          ) : null}
        </li>
      ))}
    </ol>
  );
}
