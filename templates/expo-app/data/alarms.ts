// TEMPLATE FILE — owned by the platform, never written by the model.
// Alarms: as many as the app needs, each at a time on chosen days (or once). They ring with the
// phone's ringtone even when the app is closed, and open the alarm's own screen (for example the
// task that turns it off) when one rings while the app is open or when it's tapped. In the web
// preview they go off too, while the preview is open.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import "./notifications";

export interface Alarm {
  id: string;
  hour: number;
  minute: number;
  /** The days it repeats, 0 (Sunday) to 6 (Saturday). [] rings once, at the next hour:minute. */
  days: number[];
  title: string;
  body: string;
  /** The screen that opens when it rings, e.g. `/ring/${id}`. */
  href: string;
}

type Permission = "undetermined" | "granted" | "denied";

const KEY = "app:alarms";
const CHANNEL = "alarms";

let state: { ready: boolean; permission: Permission } = {
  ready: false,
  permission: "undetermined",
};
const listeners = new Set<() => void>();
function update(next: Partial<typeof state>) {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  loading ??= Notifications.getPermissionsAsync()
    .then(({ status }) => update({ ready: true, permission: status as Permission }))
    .catch(() => update({ ready: true }));
  return loading;
}

/** Ask to send notifications (alarms need it). Resolves false when the person declines. */
export async function requestAlarmPermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  const status =
    current.status === "granted"
      ? current.status
      : (await Notifications.requestPermissionsAsync()).status;
  update({ ready: true, permission: status as Permission });
  if (status !== "granted") return false;
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Alarms",
      importance: Notifications.AndroidImportance.MAX,
      sound: "default",
      vibrationPattern: [0, 600, 400, 600],
    });
  return true;
}

/** The next time an alarm rings after `from`. */
function nextTime(alarm: Alarm, from: Date): Date {
  for (let ahead = 0; ahead <= 7; ahead++) {
    const at = new Date(from);
    at.setDate(at.getDate() + ahead);
    at.setHours(alarm.hour, alarm.minute, 0, 0);
    if (at <= from) continue;
    if (!alarm.days.length || alarm.days.includes(at.getDay())) return at;
  }
  const at = new Date(from);
  at.setDate(at.getDate() + 1);
  at.setHours(alarm.hour, alarm.minute, 0, 0);
  return at;
}

/** When the soonest of these alarms rings next (null for none), for a "next ring in" label. */
export function nextRing(alarms: Alarm[], from: Date = new Date()): Date | null {
  let soonest: Date | null = null;
  for (const alarm of alarms) {
    const at = nextTime(alarm, from);
    if (!soonest || at < soonest) soonest = at;
  }
  return soonest;
}

function content(alarm: Alarm): Notifications.NotificationContentInput {
  return {
    title: alarm.title,
    body: alarm.body,
    data: { kind: "alarm", alarmId: alarm.id, href: alarm.href },
    // iOS: the ringtone rather than the short notification sound.
    sound: Platform.OS === "ios" ? "defaultRingtone" : "default",
    interruptionLevel: "timeSensitive",
  };
}

// Android: deliver on time even in battery saving (falls back to best effort without permission).
const delivery = Platform.OS === "android" ? { delivery: "alarmClock" as const } : {};

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work);
  queue = run.catch(() => {});
  return run;
}

/**
 * Schedule exactly these alarms (the enabled ones), replacing the ones scheduled before. Call it
 * whenever the app's alarms change. Asks for permission the first time; resolves false when
 * notifications aren't allowed.
 */
export function setAlarms(alarms: Alarm[]): Promise<boolean> {
  return serial(async () => {
    if (!(await requestAlarmPermission())) return false;
    const previous = JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]") as string[];
    await Promise.all(
      previous.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
    );
    const scheduled: string[] = [];
    for (const alarm of alarms) {
      const triggers: Notifications.NotificationTriggerInput[] = alarm.days.length
        ? alarm.days.map((day) => ({
            type: Notifications.SchedulableTriggerInputTypes.WEEKLY,
            weekday: day + 1,
            hour: alarm.hour,
            minute: alarm.minute,
            channelId: CHANNEL,
            ...delivery,
          }))
        : [
            {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date: nextTime(alarm, new Date()),
              channelId: CHANNEL,
              ...delivery,
            },
          ];
      for (const trigger of triggers)
        scheduled.push(
          await Notifications.scheduleNotificationAsync({ content: content(alarm), trigger }),
        );
    }
    await AsyncStorage.setItem(KEY, JSON.stringify(scheduled));
    return true;
  });
}

async function ringIn(alarm: Alarm, seconds: number): Promise<boolean> {
  if (!(await requestAlarmPermission())) return false;
  await Notifications.scheduleNotificationAsync({
    content: content(alarm),
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
      seconds: Math.max(1, Math.round(seconds)),
      channelId: CHANNEL,
    },
  });
  return true;
}

/** Ring this alarm again in a few minutes. */
export function snoozeAlarm(alarm: Alarm, minutes = 9): Promise<boolean> {
  return ringIn(alarm, minutes * 60);
}

/** Ring this alarm in a few seconds, to try it ("Test alarm"); works in the preview too. */
export function testAlarm(alarm: Alarm, seconds = 3): Promise<boolean> {
  return ringIn(alarm, seconds);
}

/** Whether alarms may ring: { ready, permission, request() }. */
export function useAlarms() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    void load();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { ...state, request: requestAlarmPermission };
}
