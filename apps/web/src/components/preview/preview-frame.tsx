"use client";

import { useEffect, useEffectEvent, useImperativeHandle, useRef, useState, type Ref } from "react";
import {
  isEnvelope,
  PREVIEW_CHANNEL,
  type FrameToParent,
  type ParentToFrame,
  type PreviewMode,
  type ProjectFiles,
} from "@appbuilder/contract/protocol";

export const PREVIEW_ORIGIN = process.env.NEXT_PUBLIC_PREVIEW_ORIGIN || "http://localhost:3001";

export interface PreviewFrameProps {
  frameId: string;
  files: ProjectFiles;
  mode: PreviewMode;
  href: string;
  themeId?: string;
  selectMode?: boolean;
  width?: number;
  height?: number;
  onMessage?: (message: FrameToParent) => void;
  title?: string;
  /** Initial AsyncStorage contents for the app (e.g. the App Cloud session). */
  storage?: Record<string, string>;
  /** Report the app's storage writes through onMessage ("storage" messages). */
  persistStorage?: boolean;
  /**
   * Keep the running app's saved data and screen when the frame has to load again (new files,
   * mode or storage), like an app that stays installed on a phone. The frame only starts fresh
   * when it remounts.
   */
  keepState?: boolean;
  /** Visual scale (the app still renders at full device size inside). */
  scale?: number;
  className?: string;
  /** Show the theme's light or dark partner (null: the theme as it is). */
  appearance?: "light" | "dark" | null;
  /** Double-click on text edits it in place; the frame reports it as "text-edit". */
  editText?: boolean;
  /** capture(): the screen as a PNG data URL (store screenshots). */
  ref?: Ref<PreviewFrameHandle>;
}

export interface PreviewFrameHandle {
  capture: (pixelRatio?: number) => Promise<string>;
  /** Show another screen: the app loads again there, keeping its saved data (keepState). */
  open: (href: string) => void;
}

/**
 * One sandboxed preview frame. Generated code runs on the preview origin with an opaque
 * origin (no allow-same-origin), so it can never touch this app's cookies or DOM.
 */
export function PreviewFrame({
  frameId,
  files,
  mode,
  href,
  themeId,
  selectMode = false,
  width = 320,
  height = 660,
  onMessage,
  title,
  scale = 1,
  className,
  storage,
  persistStorage = false,
  keepState = false,
  appearance = null,
  editText = false,
  ref,
}: PreviewFrameProps) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const captures = useRef(
    new Map<string, { resolve: (png: string) => void; reject: (e: Error) => void }>(),
  );

  const ready = useRef(false);
  // keepState: what the app wrote to its storage, and the screen it's on, across loads.
  const written = useRef(new Map<string, string | null>());
  const path = useRef<string | null>(null);
  // open(): a screen to load next (numbered, so opening the same screen again reloads it).
  const [entry, setEntry] = useState<{ href: string; n: number } | null>(null);

  const send = (message: ParentToFrame) => {
    // Opaque-origin frames can only be addressed with "*"; we verify replies by source.
    iframe.current?.contentWindow?.postMessage(
      { ...message, channel: PREVIEW_CHANNEL, frameId },
      "*",
    );
  };

  useImperativeHandle(ref, () => ({
    open: (to: string) => setEntry((current) => ({ href: to, n: (current?.n ?? 0) + 1 })),
    capture: (pixelRatio = 3) =>
      new Promise<string>((resolve, reject) => {
        const requestId = Math.random().toString(36).slice(2);
        captures.current.set(requestId, { resolve, reject });
        send({ type: "capture", requestId, pixelRatio });
        setTimeout(() => {
          if (captures.current.delete(requestId))
            reject(new Error("The screen didn't render in time."));
        }, 20_000);
      }),
  }));

  const load = useEffectEvent((at?: string) => {
    let initial = storage;
    if (keepState && written.current.size) {
      const merged = { ...storage };
      for (const [key, value] of written.current) {
        if (value === null) delete merged[key];
        else merged[key] = value;
      }
      initial = merged;
    }
    send({
      type: "load",
      files,
      mode,
      href: at ?? href,
      themeId,
      selectMode,
      storage: initial,
      persistStorage: persistStorage || keepState,
      appearance,
      editText,
    });
  });

  const receive = useEffectEvent((message: FrameToParent) => {
    if (message.type === "captured") {
      const pending = captures.current.get(message.requestId);
      captures.current.delete(message.requestId);
      if (message.png) pending?.resolve(message.png);
      else pending?.reject(new Error(message.error ?? "Couldn't capture the screen."));
      return;
    }
    if (message.type === "ready") {
      if (ready.current) return; // "ready" can arrive twice (startup + reply to hello)
      ready.current = true;
      load();
    }
    if (keepState && message.type === "navigated") path.current = message.href;
    if (keepState && message.type === "storage") {
      const { key, value } = message as { key: unknown; value: unknown };
      if (typeof key === "string" && (value === null || typeof value === "string"))
        written.current.set(key, value);
      if (!persistStorage) return;
    }
    onMessage?.(message);
  });

  useEffect(() => {
    const onWindowMessage = (event: MessageEvent) => {
      if (event.source !== iframe.current?.contentWindow) return;
      if (!isEnvelope(event.data) || event.data.frameId !== frameId) return;
      receive(event.data as unknown as FrameToParent);
    };
    window.addEventListener("message", onWindowMessage);
    // The frame may have loaded before this listener existed; ask it to announce itself.
    iframe.current?.contentWindow?.postMessage(
      { type: "hello", channel: PREVIEW_CHANNEL, frameId },
      "*",
    );
    return () => window.removeEventListener("message", onWindowMessage);
  }, [frameId]);

  // A new entry route starts there.
  useEffect(() => {
    if (ready.current) load();
  }, [href]);
  // New files, mode or storage load the app again; with keepState it stays on its screen.
  useEffect(() => {
    if (ready.current) load(keepState ? (path.current ?? undefined) : undefined);
  }, [files, mode, storage, keepState]);
  useEffect(() => {
    if (entry && ready.current) load(entry.href);
  }, [entry]);

  useEffect(() => {
    if (ready.current && themeId) {
      iframe.current?.contentWindow?.postMessage(
        { type: "set-theme", themeId, channel: PREVIEW_CHANNEL, frameId },
        "*",
      );
    }
  }, [themeId, frameId]);

  // After the theme: picking a theme shows it as it is, then this applies light or dark.
  useEffect(() => {
    if (ready.current && (appearance || themeId)) {
      iframe.current?.contentWindow?.postMessage(
        { type: "set-appearance", appearance, channel: PREVIEW_CHANNEL, frameId },
        "*",
      );
    }
  }, [appearance, themeId, frameId]);

  useEffect(() => {
    if (ready.current) {
      iframe.current?.contentWindow?.postMessage(
        { type: "set-select-mode", enabled: selectMode, channel: PREVIEW_CHANNEL, frameId },
        "*",
      );
    }
  }, [selectMode, frameId]);

  const frame = (
    <iframe
      ref={iframe}
      title={title ?? `Preview ${frameId}`}
      data-frame-id={frameId}
      src={`${PREVIEW_ORIGIN}/#frame=${encodeURIComponent(frameId)}`}
      sandbox="allow-scripts"
      onLoad={() => send({ type: "hello" })}
      width={width}
      height={height}
      style={
        scale === 1 ? undefined : { transform: `scale(${scale})`, transformOrigin: "top left" }
      }
      className={className ?? "rounded-[2rem] border-8 border-neutral-900 bg-white shadow-xl"}
    />
  );
  if (scale === 1) return frame;
  return (
    <div
      style={{ width: width * scale, height: height * scale }}
      className="relative shrink-0 overflow-hidden"
    >
      <div className="absolute left-0 top-0">{frame}</div>
    </div>
  );
}
