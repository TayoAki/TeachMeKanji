// TEMPLATE FILE — owned by the platform, never written by the model.
// App Cloud repository: the same interface as data/local.ts, backed by the platform's API.
// Every device gets an anonymous account automatically; signing up (data/auth.ts) keeps it.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { backend } from "./backend";
import { seedRows } from "./local";
import type { Record_, Repository } from "./repo";

export const TOKEN_KEY = "app:auth:token";
const SEEDED_KEY = "app:cloud:seeded:";
const listeners = new Map<string, Set<() => void>>();
let tokenPromise: Promise<string> | null = null;

function base(): string {
  return `${backend.apiUrl}/api/app/${backend.projectId}`;
}

export async function getToken(): Promise<string> {
  const stored = await AsyncStorage.getItem(TOKEN_KEY);
  if (stored) return stored;
  tokenPromise ??= fetch(`${base()}/auth/anonymous`, { method: "POST" })
    .then((r) => r.json() as Promise<{ token: string }>)
    .then(async ({ token }) => {
      await AsyncStorage.setItem(TOKEN_KEY, token);
      return token;
    })
    .finally(() => {
      tokenPromise = null;
    });
  return tokenPromise;
}

export async function setToken(token: string | null): Promise<void> {
  if (token) await AsyncStorage.setItem(TOKEN_KEY, token);
  else await AsyncStorage.removeItem(TOKEN_KEY);
  listeners.forEach((set) => set.forEach((listener) => listener()));
}

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getToken();
  const response = await fetch(`${base()}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init.headers,
    },
  });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (response.status === 401) {
    // Session expired or signed out elsewhere: start a fresh anonymous session.
    await AsyncStorage.removeItem(TOKEN_KEY);
  }
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

/** First-launch seeding of a collection, shared by every screen that loads it at that moment. */
const seeding = new Map<string, Promise<Record_[]>>();

function notify(collection: string) {
  listeners.get(collection)?.forEach((listener) => listener());
}

async function list<T extends Record_>(collection: string): Promise<T[]> {
  const { records } = await api<{ records: T[] }>(`/collections/${collection}`);
  const starting = seedRows(collection) as Record_[];
  const token = await getToken();
  const seededKey = `${SEEDED_KEY}${collection}:${token.slice(0, 12)}`;
  const seen = await AsyncStorage.getItem(seededKey);
  // A collection is seeded only the first time this device finds it empty. Once it has had
  // records here, empty means the person deleted them, and the starting rows stay away.
  if (records.length > 0) {
    if (!seen) await AsyncStorage.setItem(seededKey, "1");
    return records;
  }
  // Another screen is seeding this collection right now: share its result.
  const pending = seeding.get(collection);
  if (pending) return (await pending) as T[];
  if (starting.length > 0 && !seen) {
    const job = (async () => {
      await AsyncStorage.setItem(seededKey, "1");
      await api(`/collections/${collection}`, {
        method: "POST",
        body: JSON.stringify({ records: starting }),
      });
      return starting;
    })();
    seeding.set(collection, job);
    try {
      return (await job) as T[];
    } finally {
      seeding.delete(collection);
      // A screen that read the collection empty while it was being seeded loads it again.
      notify(collection);
    }
  }
  return records;
}

export const remoteRepository: Repository = {
  list,
  async put(collection, item) {
    await api(`/collections/${collection}`, {
      method: "POST",
      body: JSON.stringify({ records: [item] }),
    });
    notify(collection);
  },
  async remove(collection, id) {
    await api(`/collections/${collection}/${encodeURIComponent(id)}`, { method: "DELETE" });
    notify(collection);
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
