import type { ProjectFiles } from "./layout";

/**
 * Messages between the workspace (parent window) and a preview frame (sandboxed iframe on
 * the preview origin). Every message carries `channel` and the frame's `frameId` so one
 * parent can drive many frames (canvas screens + the interactive app preview).
 *
 * The frame has an opaque origin (sandbox without allow-same-origin), so the parent checks
 * `event.source === iframe.contentWindow` and the frame checks `event.source === parent`.
 */
export const PREVIEW_CHANNEL = "appbuilder-preview/v0";

export type PreviewMode = "app" | "screen";

export type ParentToFrame =
  /** Handshake from the parent; the frame answers with "ready". Covers the case where the
   *  frame finished loading before the parent attached its listener (e.g. before hydration). */
  | { type: "hello" }
  | {
      type: "load";
      files: ProjectFiles;
      mode: PreviewMode;
      href: string;
      themeId?: string;
      selectMode?: boolean;
    }
  | { type: "set-theme"; themeId: string }
  | { type: "set-select-mode"; enabled: boolean }
  | { type: "navigate"; href: string };

export interface SelectedElement {
  fid: string;
  /** Text content of the element, trimmed and truncated. */
  text: string;
  rect: { x: number; y: number; width: number; height: number };
  style: { color: string; backgroundColor: string; fontSize: string; padding: string };
}

export type FrameToParent =
  | { type: "ready" }
  | { type: "rendered"; href: string; ms: number }
  | { type: "navigated"; href: string }
  | { type: "navigate-request"; href: string; action: "push" | "replace" | "back" | "navigate" }
  | { type: "select"; element: SelectedElement }
  | { type: "error"; message: string; file?: string };

export type Envelope<T> = T & { channel: typeof PREVIEW_CHANNEL; frameId: string };

export function isEnvelope(data: unknown): data is Envelope<{ type: string }> {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { channel?: unknown }).channel === PREVIEW_CHANNEL &&
    typeof (data as { frameId?: unknown }).frameId === "string"
  );
}
