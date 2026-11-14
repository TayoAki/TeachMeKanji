/**
 * Stand-ins for native capabilities the web preview can't run. Apps reach them only through the
 * platform's helpers (components/share.ts, data/reminders.ts), which fall back gracefully:
 * sharing an image becomes sharing text, and reminders and alarms fire while the preview is open.
 */

// react-native-view-shot
export async function captureRef(): Promise<string> {
  throw new Error("Capturing a view as an image runs on a phone, not in the preview.");
}

// expo-sharing
export async function isAvailableAsync(): Promise<boolean> {
  return false;
}
export async function shareAsync(): Promise<void> {}

// expo-notifications. Scheduled notifications fire while the preview is open (an alarm set for
// a minute from now rings), so apps with alarms and reminders can be tried here; still renders
// (canvas frames, screenshots) never fire them.
type PermissionStatus = "granted" | "denied" | "undetermined";
let permission: PermissionStatus = "undetermined";
let nextId = 0;

interface Scheduled {
  content: { data?: Record<string, unknown> } & Record<string, unknown>;
  trigger: Record<string, unknown> | null;
}
type Listener = (notification: unknown) => void;
const timers = new Map<string, ReturnType<typeof setTimeout>>();
const received = new Set<Listener>();
const tapped = new Set<Listener>();
const DAY = 24 * 60 * 60 * 1000;

/** Milliseconds until a trigger next fires (null: not within a day, or not a time trigger). */
function delayOf(trigger: Scheduled["trigger"], now = new Date()): number | null {
  if (!trigger) return 0;
  const at = new Date(now);
  switch (trigger.type) {
    case "timeInterval":
      return Number(trigger.seconds) * 1000;
    case "date":
      return new Date(trigger.date as string | number).getTime() - now.getTime();
    case "daily":
    case "weekly": {
      at.setHours(Number(trigger.hour), Number(trigger.minute), 0, 0);
      for (let ahead = 0; ahead <= 7; ahead++) {
        const next = new Date(at);
        next.setDate(at.getDate() + ahead);
        if (next <= now) continue;
        if (trigger.type === "weekly" && next.getDay() + 1 !== Number(trigger.weekday)) continue;
        return next.getTime() - now.getTime();
      }
      return null;
    }
    default:
      return null;
  }
}

function arm(id: string, request: Scheduled) {
  const delay = delayOf(request.trigger);
  if (delay === null || delay < 0 || delay > DAY) return;
  timers.set(
    id,
    setTimeout(() => {
      timers.delete(id);
      if ((globalThis as { __appbuilderStill?: boolean }).__appbuilderStill) return;
      const notification = { date: Date.now(), request: { identifier: id, ...request } };
      received.forEach((listener) => listener(notification));
      // Repeating triggers go off again next time.
      if (request.trigger && ["daily", "weekly"].includes(String(request.trigger.type)))
        arm(id, request);
    }, delay),
  );
}

/** A new load: nothing scheduled by the previous app keeps running. */
export function resetNotifications(): void {
  timers.forEach((timer) => clearTimeout(timer));
  timers.clear();
  received.clear();
  tapped.clear();
}

export const notifications = {
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ status: permission, granted: permission === "granted" }),
  requestPermissionsAsync: async () => {
    permission = "granted";
    return { status: permission, granted: true };
  },
  setNotificationChannelAsync: async () => null,
  scheduleNotificationAsync: async (request: Scheduled) => {
    const id = `preview-notification-${++nextId}`;
    arm(id, request);
    return id;
  },
  cancelScheduledNotificationAsync: async (id: string) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
  },
  cancelAllScheduledNotificationsAsync: async () => {
    timers.forEach((timer) => clearTimeout(timer));
    timers.clear();
  },
  getAllScheduledNotificationsAsync: async () => [],
  addNotificationReceivedListener: (listener: Listener) => {
    received.add(listener);
    return { remove: () => received.delete(listener) };
  },
  addNotificationResponseReceivedListener: (listener: Listener) => {
    tapped.add(listener);
    return { remove: () => tapped.delete(listener) };
  },
  getLastNotificationResponse: () => null,
  getLastNotificationResponseAsync: async () => null,
  clearLastNotificationResponse: () => {},
  clearLastNotificationResponseAsync: async () => {},
  DEFAULT_ACTION_IDENTIFIER: "expo.modules.notifications.actions.DEFAULT",
  getExpoPushTokenAsync: async () => {
    throw new Error("Push notifications need a store or development build.");
  },
  SchedulableTriggerInputTypes: {
    DAILY: "daily",
    WEEKLY: "weekly",
    TIME_INTERVAL: "timeInterval",
    DATE: "date",
  },
  AndroidImportance: { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 },
};
