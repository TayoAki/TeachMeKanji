// TEMPLATE FILE — owned by the platform, never written by the model.
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import type { Record_, Repository } from "./repo";
import * as seeds from "./seed";

const KEY_PREFIX = "app:collection:";
const listeners = new Map<string, Set<() => void>>();

/**
 * The rows a collection starts with. Sample records show where the owner is trying the app (the
 * preview, Expo Go); a real install starts with only the collections data/seed lists in
 * `starter` (reference content), or with every collection when it lists none (older apps).
 */
export function seedRows(collection: string): unknown[] {
  const rows = (seeds.seed as Record<string, unknown[]>)[collection] ?? [];
  const starter = (seeds as { starter?: readonly string[] }).starter;
  const trying =
    Boolean((globalThis as { __appbuilderPreview?: boolean }).__appbuilderPreview) ||
    Constants.executionEnvironment === "storeClient";
  return trying || !starter || starter.includes(collection) ? rows : [];
}

async function read<T extends Record_>(collection: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(KEY_PREFIX + collection);
  if (raw === null) {
    const initial = seedRows(collection) as T[];
    await AsyncStorage.setItem(KEY_PREFIX + collection, JSON.stringify(initial));
    return initial;
  }
  return JSON.parse(raw) as T[];
}

async function write<T extends Record_>(collection: string, rows: T[]): Promise<void> {
  await AsyncStorage.setItem(KEY_PREFIX + collection, JSON.stringify(rows));
  listeners.get(collection)?.forEach((listener) => listener());
}

export const localRepository: Repository = {
  list: read,
  async put(collection, item) {
    const rows = await read<typeof item>(collection);
    const index = rows.findIndex((row) => row.id === item.id);
    if (index === -1) rows.push(item);
    else rows[index] = item;
    await write(collection, rows);
  },
  async remove(collection, id) {
    const rows = await read(collection);
    await write(
      collection,
      rows.filter((row) => row.id !== id),
    );
  },
  subscribe(collection, listener) {
    let set = listeners.get(collection);
    if (!set) {
      set = new Set();
      listeners.set(collection, set);
    }
    set.add(listener);
    return () => set!.delete(listener);
  },
};
