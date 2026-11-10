"use client";

import { useEffect, useEffectEvent, useRef } from "react";
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
  /** Visual scale (the app still renders at full device size inside). */
  scale?: number;
  className?: string;
  /** Show the theme's light or dark partner (null: the theme as it is). */
  appearance?: "light" | "dark" | null;
  /** Double-click on text edits it in place; the frame reports it as "text-edit". */
  editText?: boolean;
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
  appearance = null,
  editText = false,
}: PreviewFrameProps) {
  const iframe = useRef<HTMLIFrameElement>(null);
  const ready = useRef(false);

  const send = (message: ParentToFrame) => {
    // Opaque-origin frames can only be addressed with "*"; we verify replies by source.
    iframe.current?.contentWindow?.postMessage(
      { ...message, channel: PREVIEW_CHANNEL, frameId },
      "*",
    );
  };

  const load = useEffectEvent(() => {
    send({
      type: "load",
      files,
      mode,
      href,
      themeId,
      selectMode,
      storage,
      persistStorage,
      appearance,
      editText,
    });
  });

  const receive = useEffectEvent((message: FrameToParent) => {
    if (message.type === "ready") {
      if (ready.current) return; // "ready" can arrive twice (startup + reply to hello)
      ready.current = true;
      load();
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

  // Reload when the project or entry route changes.
  useEffect(() => {
    if (ready.current) load();
  }, [files, href, mode, storage]);

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
