// TEMPLATE FILE — owned by the platform, never written by the model.
// The daily habit: the one thing people do every day in the app, the streak for doing it, and
// two local nudges. The morning one (the carrot) says what's waiting today; the evening one (the
// stick) comes only on a day that isn't done yet while there's a streak to lose. Doing today's
// action calls off the rest of today's nudges. Everything stays on the phone; in the web preview
// the nudges go off while the preview is open.
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { useEffect, useState } from "react";
import { Platform } from "react-native";
import { noteWin } from "./growth";
import "./notifications";

export interface Nudge {
  hour: number;
  minute: number;
  title: string;
  /** "{streak}" is replaced by the streak, e.g. "Your {streak}-day streak ends at midnight". */
  body: string;
}

export interface NudgePlan {
  /** Morning: what's waiting today, e.g. "Today's question is ready". */
  carrot: Nudge;
  /** Evening, only when today isn't done and there's a streak: what they'd lose. */
  stick: Nudge;
  /** The screen the nudges open, e.g. "/". */
  href: string;
}

export interface HabitDay {
  /** Local date, YYYY-MM-DD. */
  date: string;
  done: boolean;
  today: boolean;
}

type Permission = "undetermined" | "granted" | "denied";

const KEY = "app:habit";
const NUDGES_KEY = "app:habit:nudges";
const CHANNEL = "habit";
/** How many days of morning nudges are scheduled ahead (refreshed whenever the app opens). */
const DAYS_AHEAD = 7;
/** Streaks worth a bigger celebration. */
export const MILESTONES = [3, 7, 14, 30, 50, 100, 200, 365];

interface Saved {
  days: string[];
  best: number;
}
interface SavedNudges {
  enabled: boolean;
  plan: NudgePlan | null;
  ids: string[];
}

let saved: Saved = { days: [], best: 0 };
let nudges: SavedNudges = { enabled: false, plan: null, ids: [] };
let state = {
  ready: false,
  /** Days in a row, counting today once it's done (a streak stays alive until midnight). */
  streak: 0,
  best: 0,
  doneToday: false,
  /** The last 7 days, oldest first, for a row of dots. */
  week: [] as HabitDay[],
  nudgesOn: false,
  permission: "undetermined" as Permission,
};
const listeners = new Set<() => void>();

function dateKey(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function daysAgo(n: number, from = new Date()): Date {
  const d = new Date(from);
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() - n);
  return d;
}

function streakOf(days: Set<string>, now = new Date()): number {
  let ago = days.has(dateKey(now)) ? 0 : 1;
  let streak = 0;
  while (days.has(dateKey(daysAgo(ago, now)))) {
    streak++;
    ago++;
  }
  return streak;
}

function refresh(next: Partial<typeof state> = {}) {
  const now = new Date();
  const days = new Set(saved.days);
  const streak = streakOf(days, now);
  state = {
    ...state,
    ...next,
    streak,
    best: Math.max(saved.best, streak),
    doneToday: days.has(dateKey(now)),
    week: Array.from({ length: 7 }, (_, i) => {
      const date = dateKey(daysAgo(6 - i, now));
      return { date, done: days.has(date), today: i === 6 };
    }),
    nudgesOn: nudges.enabled,
  };
  listeners.forEach((listener) => listener());
}

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(work: () => Promise<T>): Promise<T> {
  const run = queue.then(work);
  queue = run.catch(() => {});
  return run;
}

/** Schedule the next days' nudges for where the habit stands now (replacing earlier ones). */
function reschedule(): Promise<void> {
  return serial(async () => {
    await Promise.all(
      nudges.ids.map((id) => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})),
    );
    const ids: string[] = [];
    const plan = nudges.plan;
    if (nudges.enabled && plan) {
      const now = new Date();
      const doneToday = state.doneToday;
      const at = (ahead: number, nudge: Nudge) => {
        const d = new Date(now);
        d.setDate(d.getDate() + ahead);
        d.setHours(nudge.hour, nudge.minute, 0, 0);
        return d;
      };
      const schedule = async (nudge: Nudge, date: Date, streak: number) => {
        if (date <= now) return;
        const fill = (text: string) => text.replace(/\{streak\}/g, String(streak));
        ids.push(
          await Notifications.scheduleNotificationAsync({
            content: {
              title: fill(nudge.title),
              body: fill(nudge.body),
              data: { kind: "habit", href: plan.href },
            },
            trigger: {
              type: Notifications.SchedulableTriggerInputTypes.DATE,
              date,
              channelId: CHANNEL,
            },
          }),
        );
      };
      for (let ahead = doneToday ? 1 : 0; ahead < DAYS_AHEAD; ahead++)
        await schedule(plan.carrot, at(ahead, plan.carrot), state.streak);
      // The stick: tonight if today isn't done yet; tomorrow night if it is (that's the day the
      // streak is at risk next). Further ahead it isn't known whether there'll be a streak.
      if (state.streak > 0)
        await schedule(plan.stick, at(doneToday ? 1 : 0, plan.stick), state.streak);
    }
    nudges = { ...nudges, ids };
    await AsyncStorage.setItem(NUDGES_KEY, JSON.stringify(nudges));
  });
}

let loading: Promise<void> | null = null;
function load(): Promise<void> {
  loading ??= (async () => {
    try {
      const [rawHabit, rawNudges, { status }] = await Promise.all([
        AsyncStorage.getItem(KEY),
        AsyncStorage.getItem(NUDGES_KEY),
        Notifications.getPermissionsAsync(),
      ]);
      if (rawHabit) saved = { ...saved, ...(JSON.parse(rawHabit) as Partial<Saved>) };
      if (rawNudges) nudges = { ...nudges, ...(JSON.parse(rawNudges) as Partial<SavedNudges>) };
      refresh({ ready: true, permission: status as Permission });
      // Roll the nudges forward from today each time the app opens.
      if (nudges.enabled) await reschedule();
    } catch {
      refresh({ ready: true });
    }
  })();
  return loading;
}

/**
 * Mark today's action done. Resolves with the streak, whether this was the first time today
 * (call it every time; only the first counts) and whether the streak just hit a milestone worth
 * a bigger celebration. It also counts as a win for the rating prompt (noteWin()).
 */
export async function completeToday(): Promise<{
  streak: number;
  first: boolean;
  milestone: boolean;
}> {
  await load();
  const today = dateKey(new Date());
  if (saved.days.includes(today)) return { streak: state.streak, first: false, milestone: false };
  const days = [...saved.days, today].slice(-400);
  const streak = streakOf(new Set(days));
  saved = { days, best: Math.max(saved.best, streak) };
  await AsyncStorage.setItem(KEY, JSON.stringify(saved));
  refresh();
  await reschedule();
  void noteWin();
  return { streak, first: true, milestone: MILESTONES.includes(streak) };
}

/**
 * Turn on the morning and evening nudges (asks for permission the first time). Resolves false
 * when notifications aren't allowed; they can be allowed later in the phone's settings.
 */
export async function enableNudges(plan: NudgePlan): Promise<boolean> {
  await load();
  const current = await Notifications.getPermissionsAsync();
  const status =
    current.status === "granted"
      ? current.status
      : (await Notifications.requestPermissionsAsync()).status;
  refresh({ permission: status as Permission });
  if (status !== "granted") return false;
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync(CHANNEL, {
      name: "Daily nudges",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  nudges = { ...nudges, enabled: true, plan };
  refresh();
  await reschedule();
  return true;
}

/** Turn the nudges off. */
export async function disableNudges(): Promise<void> {
  await load();
  nudges = { ...nudges, enabled: false };
  refresh();
  await reschedule();
}

/**
 * The habit: { ready, streak, best, doneToday, week, nudgesOn, permission, complete(),
 * enableNudges(plan), disableNudges() }.
 */
export function useHabit() {
  const [, rerender] = useState(0);
  useEffect(() => {
    const listener = () => rerender((n) => n + 1);
    listeners.add(listener);
    void load();
    return () => {
      listeners.delete(listener);
    };
  }, []);
  return { ...state, complete: completeToday, enableNudges, disableNudges };
}
