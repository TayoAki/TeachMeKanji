/**
 * Preview runtime: runs inside a sandboxed iframe on the preview origin, receives a
 * project's files from the parent, and renders them with react-native-web.
 */
import { Component, useEffect, useState, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { Text, View } from "react-native";
import {
  buildRouteTree,
  isEnvelope,
  PREVIEW_CHANNEL,
  type FrameToParent,
  type ParentToFrame,
} from "@appbuilder/contract";
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
const selection = createSelection((element) => post({ type: "select", element }));

window.addEventListener("error", (event) => post({ type: "error", message: event.message }));
window.addEventListener("unhandledrejection", (event) =>
  post({ type: "error", message: String((event.reason as Error)?.message ?? event.reason) }),
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
  resetAsyncStorage();

  const tree = buildRouteTree(Object.keys(message.files));
  const modules = createModuleSystem(message.files, vendorModules, { instrument: true });
  configureNavigation({
    tree,
    mode: message.mode,
    initialHref: message.href,
    onNavigated: (href) => post({ type: "navigated", href }),
    onRequest: (href, action) => post({ type: "navigate-request", href, action }),
  });

  setTheme = (id: string) => {
    try {
      const active = modules.require("theme/active.ts") as {
        setActiveThemeId?: (id: string) => void;
      };
      active.setActiveThemeId?.(id);
    } catch (error) {
      report(error);
    }
  };
  if (message.themeId) setTheme(message.themeId);
  selection.setEnabled(message.selectMode ?? false);

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
