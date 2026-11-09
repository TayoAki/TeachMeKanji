"use client";

import { useCallback, useState } from "react";
import {
  parseFid,
  type FrameToParent,
  type ProjectFiles,
  type SelectedElement,
} from "@appbuilder/contract/protocol";
import { PreviewFrame } from "@/components/preview/preview-frame";
import { Button } from "@/components/ui/button";

const CANVAS_SCREENS = [
  { id: "today", label: "Today", href: "/" },
  { id: "progress", label: "Progress", href: "/stats" },
  { id: "detail", label: "Habit detail", href: "/habit/h1" },
  { id: "add", label: "Add habit", href: "/add-habit" },
];

interface LogEntry {
  frame: string;
  text: string;
}

export function PreviewSpike({
  files,
  themes,
}: {
  files: ProjectFiles;
  themes: Array<{ id: string; name: string }>;
}) {
  const [themeId, setThemeId] = useState(themes[0]?.id ?? "");
  const [selectMode, setSelectMode] = useState(false);
  const [appHref, setAppHref] = useState("/");
  const [selected, setSelected] = useState<{ frame: string; element: SelectedElement } | null>(
    null,
  );
  const [log, setLog] = useState<LogEntry[]>([]);

  const handle = useCallback(
    (frame: string) => (message: FrameToParent) => {
      const entry = (text: string) => setLog((l) => [{ frame, text }, ...l].slice(0, 30));
      switch (message.type) {
        case "rendered":
          entry(`rendered ${message.href} in ${message.ms} ms`);
          break;
        case "navigated":
          if (frame === "app") setAppHref(message.href);
          entry(`navigated → ${message.href}`);
          break;
        case "navigate-request":
          entry(`requested ${message.action} ${message.href}`);
          break;
        case "select":
          setSelected({ frame, element: message.element });
          break;
        case "error":
          entry(`ERROR ${message.file ?? ""} ${message.message}`);
          break;
      }
    },
    [],
  );

  const source = selected ? resolveSource(files, selected.element.fid) : null;

  return (
    <main
      className="flex min-h-screen flex-col gap-6 bg-neutral-100 p-6"
      data-testid="preview-spike"
    >
      <header className="flex flex-wrap items-center gap-3">
        <h1 className="mr-4 text-xl font-semibold">Spike A · Preview runtime</h1>
        <label className="text-sm text-muted-foreground" htmlFor="theme">
          Theme
        </label>
        <select
          id="theme"
          data-testid="theme-select"
          className="rounded-md border bg-white px-2 py-1 text-sm"
          value={themeId}
          onChange={(e) => setThemeId(e.target.value)}
        >
          {themes.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <Button
          variant={selectMode ? "default" : "outline"}
          data-testid="select-toggle"
          onClick={() => {
            setSelectMode((s) => !s);
            setSelected(null);
          }}
        >
          {selectMode ? "Selecting… (click an element)" : "Select element"}
        </Button>
      </header>

      <section className="flex flex-wrap items-start gap-8">
        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">
            Interactive app · <span data-testid="app-href">{appHref}</span>
          </h2>
          <PreviewFrame
            frameId="app"
            files={files}
            mode="app"
            href="/"
            themeId={themeId}
            selectMode={selectMode}
            onMessage={handle("app")}
          />
        </div>

        <aside className="flex w-96 flex-col gap-4">
          <div className="rounded-lg border bg-white p-4" data-testid="selection-panel">
            <h2 className="mb-2 text-sm font-medium">Selected element</h2>
            {selected ? (
              <dl className="grid grid-cols-[6rem_minmax(0,1fr)] gap-1 text-xs">
                <dt className="text-muted-foreground">fid</dt>
                <dd data-testid="selected-fid" className="break-all font-mono">
                  {selected.element.fid}
                </dd>
                <dt className="text-muted-foreground">text</dt>
                <dd data-testid="selected-text">{selected.element.text}</dd>
                <dt className="text-muted-foreground">color</dt>
                <dd>{selected.element.style.color}</dd>
                <dt className="text-muted-foreground">background</dt>
                <dd>{selected.element.style.backgroundColor}</dd>
                <dt className="text-muted-foreground">source</dt>
                <dd>
                  <pre
                    data-testid="selected-source"
                    className="max-h-48 overflow-auto rounded bg-neutral-50 p-2 text-[11px]"
                  >
                    {source}
                  </pre>
                </dd>
              </dl>
            ) : (
              <p className="text-xs text-muted-foreground">
                Turn on “Select element” and click anything in a preview.
              </p>
            )}
          </div>
          <div className="rounded-lg border bg-white p-4">
            <h2 className="mb-2 text-sm font-medium">Events</h2>
            <ul
              className="max-h-64 space-y-1 overflow-auto font-mono text-[11px]"
              data-testid="event-log"
            >
              {log.map((e, i) => (
                <li key={i}>
                  <span className="text-muted-foreground">[{e.frame}]</span> {e.text}
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-medium">Canvas · one frame per screen (screen mode)</h2>
        <div className="flex gap-6 overflow-x-auto pb-4">
          {CANVAS_SCREENS.map((s) => (
            <div key={s.id} className="flex shrink-0 flex-col gap-2">
              <span className="text-xs text-muted-foreground">{s.label}</span>
              <PreviewFrame
                frameId={s.id}
                files={files}
                mode="screen"
                href={s.href}
                themeId={themeId}
                selectMode={selectMode}
                width={280}
                height={580}
                onMessage={handle(s.id)}
              />
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}

function resolveSource(files: ProjectFiles, fidValue: string): string | null {
  const parsed = parseFid(fidValue);
  if (!parsed) return null;
  return files[parsed.path]?.slice(parsed.start, parsed.end) ?? null;
}
