import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadProject } from "@appbuilder/contract/node";
import { createModuleSystem } from "./loader";
import { vendorModules } from "./vendor";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const project = await loadProject(
  join(root, "templates/expo-app"),
  join(root, "fixtures/habit-tracker"),
);

interface Scheduled {
  content: { title: string; body: string; data: { href: string } };
  trigger: { type: string; date: Date };
}

/** data/habit.ts on a fresh phone, with what it schedules recorded. */
function freshHabit() {
  const scheduled = new Map<string, Scheduled>();
  let next = 0;
  const base = vendorModules["expo-notifications"] as Record<string, unknown>;
  const notifications = {
    ...base,
    getPermissionsAsync: async () => ({ status: "granted", granted: true }),
    scheduleNotificationAsync: async (request: Scheduled) => {
      const id = `n${++next}`;
      scheduled.set(id, request);
      return id;
    },
    cancelScheduledNotificationAsync: async (id: string) => {
      scheduled.delete(id);
    },
  };
  const storage = new Map<string, string>();
  const asyncStorage = {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => void storage.set(key, value),
    removeItem: async (key: string) => void storage.delete(key),
  };
  const modules = createModuleSystem(
    project,
    {
      ...vendorModules,
      "expo-notifications": { ...notifications, __esModule: true, default: notifications },
      "@react-native-async-storage/async-storage": {
        __esModule: true,
        default: asyncStorage,
        ...asyncStorage,
      },
    },
    { instrument: false },
  );
  const habit = modules.require("data/habit.ts") as {
    completeToday: () => Promise<{ streak: number; first: boolean; milestone: boolean }>;
    enableNudges: (plan: unknown) => Promise<boolean>;
    disableNudges: () => Promise<void>;
  };
  return { habit, scheduled: () => [...scheduled.values()] };
}

const at = (day: number, hour: number) => new Date(2026, 10, day, hour, 0, 0);
const nudges = {
  carrot: { hour: 8, minute: 0, title: "Gratitude", body: "Today's prompt is ready." },
  stick: {
    hour: 20,
    minute: 0,
    title: "Gratitude",
    body: "Your {streak}-day streak ends at midnight.",
  },
  href: "/",
};

afterEach(() => vi.useRealTimers());

describe("the daily habit (data/habit.ts)", () => {
  it("counts a streak of days in a row, once a day, and celebrates milestones", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { habit } = freshHabit();
    vi.setSystemTime(at(10, 9));
    expect(await habit.completeToday()).toEqual({ streak: 1, first: true, milestone: false });
    expect(await habit.completeToday()).toEqual({ streak: 1, first: false, milestone: false });
    vi.setSystemTime(at(11, 22));
    expect((await habit.completeToday()).streak).toBe(2);
    vi.setSystemTime(at(12, 7));
    expect(await habit.completeToday()).toEqual({ streak: 3, first: true, milestone: true });
    // A missed day ends the streak.
    vi.setSystemTime(at(14, 12));
    expect((await habit.completeToday()).streak).toBe(1);
  });

  it("nudges each morning, and in the evening only while a streak is at risk", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { habit, scheduled } = freshHabit();
    vi.setSystemTime(at(10, 9));
    await habit.completeToday();
    // Next day, 9am: this morning's nudge has passed; tonight's stick guards the 1-day streak.
    vi.setSystemTime(at(11, 9));
    expect(await habit.enableNudges(nudges)).toBe(true);
    const before = scheduled();
    const carrots = before.filter((n) => n.content.body === "Today's prompt is ready.");
    const sticks = before.filter((n) => n.content.body.includes("streak"));
    expect(carrots.map((n) => n.trigger.date.getDate())).toEqual([12, 13, 14, 15, 16, 17]);
    expect(sticks.map((n) => [n.trigger.date.getDate(), n.trigger.date.getHours()])).toEqual([
      [11, 20],
    ]);
    expect(sticks[0]!.content.body).toBe("Your 1-day streak ends at midnight.");
    expect(before.every((n) => n.content.data.href === "/" && n.trigger.type === "date")).toBe(
      true,
    );

    // Done today: tonight's stick is called off; tomorrow night's guards the 2-day streak.
    await habit.completeToday();
    const after = scheduled().filter((n) => n.content.body.includes("streak"));
    expect(after.map((n) => [n.trigger.date.getDate(), n.content.body])).toEqual([
      [12, "Your 2-day streak ends at midnight."],
    ]);

    await habit.disableNudges();
    expect(scheduled()).toEqual([]);
  });

  it("never sends the evening nudge without a streak to lose", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    const { habit, scheduled } = freshHabit();
    vi.setSystemTime(at(10, 9));
    await habit.enableNudges(nudges);
    expect(scheduled().some((n) => n.content.body.includes("streak"))).toBe(false);
    // This morning's 8:00 has passed, so the carrots start tomorrow.
    expect(scheduled().map((n) => n.trigger.date.getDate())).toEqual([11, 12, 13, 14, 15, 16]);
  });
});
