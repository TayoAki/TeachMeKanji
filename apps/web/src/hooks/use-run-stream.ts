"use client";

import { useEffect, useRef, useState } from "react";
import type { ProjectFiles } from "@appbuilder/contract/protocol";

export interface RunProgress {
  runId: string;
  status: "running" | "done" | "error" | "cancelled";
  step: string | null;
  files: ProjectFiles | null;
  written: Array<{ path: string; lines: number }>;
  warnings: string[];
  error: string | null;
  offline: boolean;
  credits: number | null;
}

/** Follow a run's server-sent events; resumes automatically if the connection drops. */
function initialProgress(runId: string): RunProgress {
  return {
    runId,
    status: "running",
    step: null,
    files: null,
    written: [],
    warnings: [],
    error: null,
    offline: false,
    credits: null,
  };
}

export function useRunStream(
  runId: string | null,
  onFinish?: (progress: RunProgress) => void,
): RunProgress | null {
  const [progress, setProgress] = useState<RunProgress | null>(null);
  const finish = useRef(onFinish);
  useEffect(() => {
    finish.current = onFinish;
  });

  useEffect(() => {
    if (!runId) return;
    let state = initialProgress(runId);
    const source = new EventSource(`/api/runs/${runId}/events`);
    const update = (patch: Partial<RunProgress>) => {
      state = { ...state, ...patch };
      setProgress(state);
    };
    const on = (type: string, handler: (data: Record<string, unknown>) => void) =>
      source.addEventListener(type, (event) =>
        handler(JSON.parse((event as MessageEvent).data || "{}")),
      );

    on("started", (d) => update({ offline: Boolean(d.offline) }));
    on("step", (d) => update({ step: String(d.label) }));
    on("file", (d) =>
      update({ written: [...state.written, { path: String(d.path), lines: Number(d.lines) }] }),
    );
    on("files", (d) => update({ files: d.files as ProjectFiles }));
    on("warning", (d) => update({ warnings: [...state.warnings, String(d.message)] }));
    const end = (status: RunProgress["status"], d: Record<string, unknown>) => {
      update({
        status,
        error: status === "done" ? null : String(d.message ?? "Failed"),
        credits: (d.credits as number) ?? null,
      });
      source.close();
      finish.current?.(state);
    };
    on("done", (d) => end("done", d));
    on("error", (d) => {
      if (Object.keys(d).length) end("error", d);
    });
    on("cancelled", (d) => end("cancelled", d));
    return () => source.close();
  }, [runId]);

  if (!runId) return null;
  return progress?.runId === runId ? progress : initialProgress(runId);
}
