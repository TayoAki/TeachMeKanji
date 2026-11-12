// TEMPLATE FILE — owned by the platform, never written by the model.
// Errors on phones reach the app's builder, so its owner and the AI can see and fix them: the
// message, the top of the stack, the screen and the platform. Never names, emails or records,
// and nothing from the preview. A crash is saved first and sent on the next launch if needed.
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { errorsConfig } from "./errors-config";

type GlobalHandler = (error: unknown, isFatal?: boolean) => void;
interface Report {
  message: string;
  stack?: string;
  screen?: string;
  fatal: boolean;
}

const INSTALL_KEY = "app:analytics:install";
const PENDING_KEY = "app:errors:pending";
/** The same message at most once a minute, and at most 20 reports a session. */
const REPEAT_MS = 60_000;
const SESSION_LIMIT = 20;

const isPreview = Boolean((globalThis as { __appbuilderPreview?: boolean }).__appbuilderPreview);
const enabled = Boolean(errorsConfig.url && errorsConfig.projectId) && !isPreview;
const isTest =
  (typeof __DEV__ !== "undefined" && __DEV__) || Constants.executionEnvironment === "storeClient";

let screen = "";
let sentThisSession = 0;
const lastSent = new Map<string, number>();

function newId(): string {
  const part = () => Math.random().toString(36).slice(2, 10);
  return `${Date.now().toString(36)}${part()}${part()}`;
}

async function installId(): Promise<string> {
  try {
    const stored = await AsyncStorage.getItem(INSTALL_KEY);
    if (stored) return stored;
    const id = newId();
    await AsyncStorage.setItem(INSTALL_KEY, id);
    return id;
  } catch {
    return newId();
  }
}

async function send(report: Report): Promise<boolean> {
  try {
    const response = await fetch(`${errorsConfig.url}/api/app/${errorsConfig.projectId}/errors`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...report,
        install: await installId(),
        platform: Platform.OS,
        test: isTest,
      }),
    });
    // 4xx: the server won't take it (limits); don't keep it.
    return response.status < 500;
  } catch {
    return false;
  }
}

async function savePending(report: Report): Promise<void> {
  try {
    const pending = JSON.parse((await AsyncStorage.getItem(PENDING_KEY)) || "[]") as Report[];
    await AsyncStorage.setItem(PENDING_KEY, JSON.stringify([...pending, report].slice(-5)));
  } catch {
    // Storage unavailable: the report is lost.
  }
}

async function sendPending(): Promise<void> {
  try {
    const pending = JSON.parse((await AsyncStorage.getItem(PENDING_KEY)) || "[]") as Report[];
    if (!pending.length) return;
    await AsyncStorage.removeItem(PENDING_KEY);
    for (const report of pending) if (!(await send(report))) await savePending(report);
  } catch {
    // Try again next launch.
  }
}

/** Called by the root layout when the visible screen changes. */
export function setErrorScreen(path: string): void {
  screen = path;
}

/** Send an error to the app's builder (does nothing in the preview or without a platform). */
export function reportError(error: unknown, options: { fatal?: boolean } = {}): void {
  if (!enabled || sentThisSession >= SESSION_LIMIT) return;
  const err = error instanceof Error ? error : new Error(String(error));
  const message = (err.message || err.name || "Unknown error").slice(0, 500);
  const now = Date.now();
  if (now - (lastSent.get(message) ?? 0) < REPEAT_MS) return;
  lastSent.set(message, now);
  sentThisSession += 1;
  const report: Report = {
    message,
    stack: err.stack?.split("\n").slice(0, 12).join("\n"),
    screen: screen || undefined,
    fatal: Boolean(options.fatal),
  };
  // A crash may end the app before the request finishes: keep it until it's sent.
  if (report.fatal) void savePending(report).then(() => sendPending());
  else void send(report).then((ok) => (ok ? undefined : savePending(report)));
}

if (enabled) {
  const utils = (
    globalThis as {
      ErrorUtils?: {
        getGlobalHandler(): GlobalHandler;
        setGlobalHandler(handler: GlobalHandler): void;
      };
    }
  ).ErrorUtils;
  if (utils) {
    const previous = utils.getGlobalHandler();
    utils.setGlobalHandler((error, isFatal) => {
      reportError(error, { fatal: Boolean(isFatal) });
      previous?.(error, isFatal);
    });
  }
  void sendPending();
}
