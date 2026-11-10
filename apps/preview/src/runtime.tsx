/**
 * Preview runtime: runs inside a sandboxed iframe on the preview origin, receives a
 * project's files from the parent, and renders them with react-native-web.
 */
import { Component, useEffect, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Text, View } from "react-native";
import {
  buildRouteTree,
  findElement,
  isEnvelope,
  literalText,
  parseFid,
  PREVIEW_CHANNEL,
  type FrameToParent,
  type ParentToFrame,
  type PreviewTheme,
  type ProjectFiles,
} from "@appbuilder/contract";
import { toPng } from "html-to-image";
import { createModuleSystem, ModuleError } from "./loader";
import { createSelection } from "./selection";
import { resetAsyncStorage } from "./shims/async-storage";
import { configureNavigation, getNavigation, RouterRoot } from "./shims/expo-router";
import { PREVIEW_INSETS, SafeAreaProvider } from "./shims/safe-area";
import { subscribeStatusBar } from "./shims/status-bar";
import { Ionicons } from "./shims/vector-icons";
import { vendorModules } from "./vendor";

const frameId = new URLSearchParams(location.hash.slice(1)).get("frame") ?? "default";

function post(message: FrameToParent) {
  // The parent's origin can't be verified from an opaque-origin frame; nothing secret is sent.
  window.parent.postMessage({ ...message, channel: PREVIEW_CHANNEL, frameId }, "*");
}

let root: Root | null = null;
let setTheme: ((id: string) => void) | null = null;
let setAppearance: ((appearance: "light" | "dark" | null) => void) | null = null;
let currentFiles: ProjectFiles = {};

function literalTextFor(value: string): string | null {
  const parsed = parseFid(value);
  const source = parsed ? currentFiles[parsed.path] : undefined;
  if (!parsed || source === undefined) return null;
  try {
    return literalText(findElement(source, parsed.start, parsed.end).element);
  } catch {
    return null;
  }
}

const selection = createSelection(
  (element) => post({ type: "select", element }),
  literalTextFor,
  (fid, text) => post({ type: "text-edit", fid, text }),
);

/** Canvas frames for routes like /expense/[id] get a real record id from the seed data. */
function resolveSampleHref(
  href: string,
  requireModule: (path: string) => Record<string, unknown>,
): string {
  if (!/\[[^\]]+\]/.test(href)) return href;
  let seed: Record<string, Array<{ id?: string }>> = {};
  try {
    seed = (requireModule("data/seed.ts").seed ?? {}) as typeof seed;
  } catch {
    // no seed data
  }
  const segments = href.split("/").filter(Boolean);
  return (
    "/" +
    segments
      .map((segment, i) => {
        if (!/^\[.+\]$/.test(segment)) return segment;
        const owner = (segments[i - 1] ?? "").toLowerCase();
        const key =
          Object.keys(seed).find((k) =>
            k.toLowerCase().startsWith(owner.slice(0, Math.max(3, owner.length - 1))),
          ) ?? Object.keys(seed)[0];
        return encodeURIComponent((key && seed[key]?.[0]?.id) || "1");
      })
      .join("/")
  );
}

function postThemeInfo(requireModule: (path: string) => Record<string, unknown>) {
  try {
    const tokens = requireModule("theme/tokens.ts") as { themes?: PreviewTheme[] };
    const active = requireModule("theme/active.ts") as {
      getActiveThemeId?: () => string;
      setAppearance?: unknown;
    };
    post({
      type: "theme-info",
      activeThemeId: active.getActiveThemeId?.() ?? "",
      canSwitchAppearance: typeof active.setAppearance === "function",
      themes: (tokens.themes ?? []).map((t) => ({
        id: t.id,
        name: t.name,
        dark: t.dark,
        colors: t.colors,
      })),
    });
  } catch {
    // project without theme tokens yet
  }
}

window.addEventListener("error", (event) => post({ type: "error", message: event.message }));
window.addEventListener("unhandledrejection", (event) =>
  post({ type: "error", message: String((event.reason as Error)?.message ?? event.reason) }),
);

// A press anywhere in the screen lets the canvas select it (clicks don't cross the iframe).
window.addEventListener(
  "pointerdown",
  () => {
    if (!selection.enabled) post({ type: "pressed" });
  },
  { capture: true },
);

window.addEventListener("message", (event) => {
  if (event.source !== window.parent || !isEnvelope(event.data) || event.data.frameId !== frameId)
    return;
  const message = event.data as unknown as ParentToFrame;
  switch (message.type) {
    case "hello":
      post({ type: "ready" });
      break;
    case "load":
      load(message);
      break;
    case "set-theme":
      setTheme?.(message.themeId);
      break;
    case "set-appearance":
      setAppearance?.(message.appearance);
      break;
    case "capture":
      void capture(message.requestId, message.pixelRatio ?? 3);
      break;
    case "set-select-mode":
      selection.setEnabled(message.enabled);
      break;
    case "navigate":
      getNavigation()?.navigate(message.href);
      break;
  }
});

function load(message: Extract<ParentToFrame, { type: "load" }>) {
  const started = performance.now();
  root?.unmount();
  resetAsyncStorage(
    message.storage ?? {},
    message.persistStorage ? (key, value) => post({ type: "storage", key, value }) : null,
  );

  currentFiles = message.files;
  const tree = buildRouteTree(Object.keys(message.files));
  const modules = createModuleSystem(message.files, vendorModules, { instrument: true });
  let initialHref = message.href;
  try {
    initialHref = resolveSampleHref(message.href, modules.require);
  } catch (error) {
    report(error);
  }
  configureNavigation({
    tree,
    mode: message.mode,
    initialHref,
    onNavigated: (href) => post({ type: "navigated", href }),
    onRequest: (href, action) => post({ type: "navigate-request", href, action }),
  });

  setTheme = (id: string) => {
    try {
      const active = modules.require("theme/active.ts") as {
        setActiveThemeId?: (id: string) => void;
      };
      active.setActiveThemeId?.(id);
      postThemeInfo(modules.require);
    } catch (error) {
      report(error);
    }
  };
  // Light or dark: the app's own theme/active.ts picks the partner theme (older apps can't).
  setAppearance = (appearance) => {
    try {
      const active = modules.require("theme/active.ts") as {
        getActiveThemeId?: () => string;
        setActiveThemeId?: (id: string) => void;
        setAppearance?: (appearance: "light" | "dark") => void;
      };
      if (appearance) active.setAppearance?.(appearance);
      else active.setActiveThemeId?.(active.getActiveThemeId?.() ?? "");
    } catch (error) {
      report(error);
    }
  };
  if (message.themeId) setTheme(message.themeId);
  else postThemeInfo(modules.require);
  if (message.appearance) setAppearance(message.appearance);
  selection.setEnabled(message.selectMode ?? false);
  selection.setTextEditing(message.editText ?? false);

  root = createRoot(document.getElementById("root")!);
  root.render(
    <ErrorBoundary>
      <SafeAreaProvider>
        <View style={{ flex: 1 }}>
          <RouterRoot tree={tree} requireModule={modules.require as never} />
          <SimulatedStatusBar />
        </View>
      </SafeAreaProvider>
    </ErrorBoundary>,
  );
  requestAnimationFrame(() =>
    requestAnimationFrame(() =>
      post({ type: "rendered", href: message.href, ms: Math.round(performance.now() - started) }),
    ),
  );
}

/** The screen as it looks now, as a PNG (store screenshots), at device pixel density. */
async function capture(requestId: string, pixelRatio: number) {
  // Phones don't show scrollbars; a store screenshot shouldn't either.
  const hideScrollbars = document.createElement("style");
  hideScrollbars.textContent =
    "*{scrollbar-width:none!important}*::-webkit-scrollbar{display:none!important}";
  document.head.append(hideScrollbars);
  try {
    await document.fonts.ready;
    const root = document.getElementById("root")!;
    const png = await toPng(root, {
      pixelRatio,
      width: root.clientWidth,
      height: root.clientHeight,
      backgroundColor: getComputedStyle(document.body).backgroundColor,
    });
    post({ type: "captured", requestId, png });
  } catch (error) {
    post({
      type: "captured",
      requestId,
      png: null,
      error: (error as Error)?.message ?? String(error),
    });
  } finally {
    hideScrollbars.remove();
  }
}

function report(error: unknown) {
  if (error instanceof ModuleError)
    post({ type: "error", message: error.message, file: error.file });
  else post({ type: "error", message: (error as Error)?.message ?? String(error) });
}

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  override state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  override componentDidCatch(error: Error) {
    report(error);
  }
  override render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <View style={{ flex: 1, padding: 24, paddingTop: 72, backgroundColor: "#fff1f1", gap: 8 }}>
        <Text style={{ fontWeight: "700", color: "#9b1c1c" }}>This screen failed to render</Text>
        {error instanceof ModuleError ? (
          <Text style={{ color: "#9b1c1c" }}>{error.file}</Text>
        ) : null}
        <Text style={{ color: "#5b1212", fontFamily: "monospace", fontSize: 12 }}>
          {error.message}
        </Text>
      </View>
    );
  }
}

function SimulatedStatusBar() {
  const [style, setStyle] = useState("auto");
  useEffect(() => subscribeStatusBar(setStyle), []);
  const color = style === "light" ? "#fff" : "#000";
  return (
    <View
      pointerEvents="none"
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: PREVIEW_INSETS.top,
        paddingHorizontal: 28,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "space-between",
      }}
    >
      <Text style={{ color, fontWeight: "600", fontSize: 15 }}>9:41</Text>
      <View style={{ flexDirection: "row", gap: 6 }}>
        <Ionicons name="cellular" size={15} color={color} />
        <Ionicons name="wifi" size={15} color={color} />
        <Ionicons name="battery-full" size={17} color={color} />
      </View>
    </View>
  );
}

post({ type: "ready" });
