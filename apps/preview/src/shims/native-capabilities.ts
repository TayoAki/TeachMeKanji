/**
 * Stand-ins for native capabilities the web preview can't run. Apps reach them only through the
 * platform's helpers (components/share.ts, data/reminders.ts), which fall back gracefully:
 * sharing an image becomes sharing text, and reminders are "scheduled" without firing.
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

// expo-notifications
type PermissionStatus = "granted" | "denied" | "undetermined";
let permission: PermissionStatus = "undetermined";
let nextId = 0;

export const notifications = {
  setNotificationHandler: () => {},
  getPermissionsAsync: async () => ({ status: permission, granted: permission === "granted" }),
  requestPermissionsAsync: async () => {
    permission = "granted";
    return { status: permission, granted: true };
  },
  setNotificationChannelAsync: async () => null,
  scheduleNotificationAsync: async () => `preview-reminder-${++nextId}`,
  cancelScheduledNotificationAsync: async () => {},
  cancelAllScheduledNotificationsAsync: async () => {},
  getAllScheduledNotificationsAsync: async () => [],
  SchedulableTriggerInputTypes: {
    DAILY: "daily",
    WEEKLY: "weekly",
    TIME_INTERVAL: "timeInterval",
    DATE: "date",
  },
  AndroidImportance: { MIN: 1, LOW: 2, DEFAULT: 3, HIGH: 4, MAX: 5 },
};
