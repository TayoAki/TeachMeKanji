// TEMPLATE FILE — owned by the platform, never written by the model.
// One daily local reminder (no server needed): useReminder() asks for permission when the user
// turns it on, schedules it at their chosen time, and remembers the choice. In the web preview
// scheduling is simulated.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
// Reminders that arrive while the app is open show too.
import "./notifications";

const KEY = "app:reminder";
const CHANNEL = "reminders";

interface Saved {
  enabled: boolean;
  hour: number;
  minute: number;
  title: string;
  body: string;
  id: string | null;
}

interface ReminderState extends Omit<Saved, "id"> {
  ready: boolean;
  permission: "undetermined" | "granted" | "denied";
}

let saved: Saved = { enabled: false, hour: 20, minute: 0, title: "", body: "", id: null };
let state: ReminderState = {
  ready: false,
  permission: "undetermined",
  enabled: false,
  hour: 20,
  minute: 0,
  title: "",
  body: "",
};
const listeners = new Set<() => void>();

function update(next: Partial<ReminderState>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

async function persist(next: Saved) {
  saved = next;
  await AsyncStorage.setItem(KEY, JSON.stringify(next));
  const { id: _id, ...visible } = next;
  update(visible);
}

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  loading ??= (async () => {
    try {
      const raw = await AsyncStorage.getItem(KEY);
      if (raw) saved = { ...saved, ...(JSON.parse(raw) as Partial<Saved>) };
      const { status } = await Notifications.getPermissionsAsync();
      const { id: _id, ...visible } = saved;
      update({ ...visible, ready: true, permission: status as ReminderState["permission"] });
    } catch {
      update({ ready: true });
    }
  })();
  return loading;
}

/**
 * Turn on the daily reminder (asks for permission the first time). Resolves false when the
 * user declines; they can allow it later in the phone's settings.
 */
export async function enableReminder(options: {
  title: string;
  body: string;
  hour?: number;
  minute?: number;
}): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  const status =
    current.status === "granted"
      ? current.status
      : (await Notifications.requestPermissionsAsync()).status;
  update({ permission: status as ReminderState["permission"] });
  if (status !== "granted") return false;
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Reminders",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  if (saved.id) await Notifications.cancelScheduledNotificationAsync(saved.id).catch(() => {});
  const hour = options.hour ?? saved.hour;
  const minute = options.minute ?? saved.minute;
  const id = await Notifications.scheduleNotificationAsync({
    content: { title: options.title, body: options.body },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DAILY,
      hour,
      minute,
      channelId: CHANNEL,
    },
  });
  await persist({ enabled: true, hour, minute, title: options.title, body: options.body, id });
  return true;
}

/** Turn the daily reminder off. */
export async function disableReminder(): Promise<void> {
  if (saved.id) await Notifications.cancelScheduledNotificationAsync(saved.id).catch(() => {});
  await persist({ ...saved, enabled: false, id: null });
}

/** Move the reminder to another time (reschedules it when it's on). */
export async function setReminderTime(hour: number, minute: number): Promise<void> {
  if (saved.enabled) await enableReminder({ title: saved.title, body: saved.body, hour, minute });
  else await persist({ ...saved, hour, minute });
}

export function useReminder() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    void load();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return {
    ...state,
    enable: enableReminder,
    disable: disableReminder,
    setTime: setReminderTime,
  };
}
