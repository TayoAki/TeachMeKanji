// TEMPLATE FILE — owned by the platform, never written by the model.
import AsyncStorage from "@react-native-async-storage/async-storage";
import type { Record_, Repository } from "./repo";
import { seed } from "./seed";

const KEY_PREFIX = "app:collection:";
const listeners = new Map<string, Set<() => void>>();

async function read<T extends Record_>(collection: string): Promise<T[]> {
  const raw = await AsyncStorage.getItem(KEY_PREFIX + collection);
  if (raw === null) {
    const initial = ((seed as Record<string, unknown[]>)[collection] ?? []) as T[];
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
