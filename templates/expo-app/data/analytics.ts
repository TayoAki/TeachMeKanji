// TEMPLATE FILE — owned by the platform, never written by the model.
// Usage analytics, when the app's owner turns them on in the builder. Screen views, app opens,
// finished onboarding, purchases and restores are counted automatically; track("name") counts
// anything else. Events carry a random install id, never names, emails or advertising ids.
// Events from the preview, Expo Go and development builds are marked as tests.
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { AppState, Platform } from "react-native";
import { analyticsConfig } from "./analytics-config";

/** Extra details on an event: short strings, numbers or booleans. */
export type EventProps = Record<string, string | number | boolean>;

interface QueuedEvent {
  name: string;
  screen?: string;
  props?: EventProps;
  test?: boolean;
  at: string;
}

const INSTALL_KEY = "app:analytics:install";
const MAX_QUEUE = 200;
const BATCH = 50;
const FLUSH_MS = 4000;

const enabled = Boolean(analyticsConfig.url && analyticsConfig.projectId);
const isTest =
  (typeof __DEV__ !== "undefined" && __DEV__) || Constants.executionEnvironment === "storeClient";

const queue: QueuedEvent[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let sending = false;
let installId: Promise<string> | null = null;
let lastScreen = "";

function newId(): string {
  const part = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}${part()}${part()}`;
}

function getInstallId(): Promise<string> {
  installId ??= AsyncStorage.getItem(INSTALL_KEY)
    .then(async (stored) => {
      if (stored) return stored;
      const id = newId();
      await AsyncStorage.setItem(INSTALL_KEY, id);
      return id;
    })
    .catch(() => newId());
  return installId;
}

async function flush(): Promise<void> {
  if (timer) clearTimeout(timer);
  timer = null;
  if (sending || queue.length === 0) return;
  sending = true;
  const batch = queue.splice(0, BATCH);
  try {
    const response = await fetch(
      `${analyticsConfig.url}/api/app/${analyticsConfig.projectId}/events`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          install: await getInstallId(),
          platform: Platform.OS,
          test: isTest,
          events: batch,
        }),
      },
    );
    // 4xx means the server won't take these (analytics off, limits): drop them.
    if (response.status >= 500) queue.unshift(...batch);
  } catch {
    // Offline: keep them for the next try, oldest dropped first when the queue is full.
    queue.unshift(...batch);
    queue.splice(0, Math.max(0, queue.length - MAX_QUEUE));
  } finally {
    sending = false;
  }
  if (queue.length > 0) schedule();
}

function schedule(): void {
  if (!timer) timer = setTimeout(() => void flush(), FLUSH_MS);
}

function record(event: Omit<QueuedEvent, "at">): void {
  if (!enabled) return;
  queue.push({ ...event, at: new Date().toISOString() });
  if (queue.length > MAX_QUEUE) queue.shift();
  if (queue.length >= BATCH) void flush();
  else schedule();
}

/**
 * Count something people do in the app, e.g. track("lesson_completed", { level: "N5" }).
 * Names are lowercase words joined by underscores. Does nothing while analytics is off.
 */
export function track(name: string, props?: EventProps): void {
  record({ name, props });
}

/** Called by the root layout when the visible screen changes. */
export function trackScreen(path: string): void {
  if (!path || path === lastScreen) return;
  lastScreen = path;
  record({ name: "screen_view", screen: path });
}

/** Called by the platform's helpers; `test` marks simulated purchases. */
export function trackSystem(name: string, props?: EventProps, test?: boolean): void {
  record({ name, props, ...(test ? { test: true } : {}) });
}

if (enabled) {
  record({ name: "app_open" });
  AppState.addEventListener("change", (status) => {
    if (status === "active") record({ name: "app_open" });
    else void flush();
  });
}
