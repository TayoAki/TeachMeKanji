// In-memory AsyncStorage. The preview frame is sandboxed with an opaque origin, so
// localStorage would throw; generated apps only ever see this async API anyway.
const store = new Map<string, string>();
let onChange: ((key: string, value: string | null) => void) | null = null;

function set(key: string, value: string) {
  store.set(key, value);
  onChange?.(key, value);
}

function del(key: string) {
  store.delete(key);
  onChange?.(key, null);
}

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return store.has(key) ? store.get(key)! : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    del(key);
  },
  async mergeItem(key: string, value: string): Promise<void> {
    const current = store.has(key) ? JSON.parse(store.get(key)!) : {};
    set(key, JSON.stringify({ ...current, ...JSON.parse(value) }));
  },
  async clear(): Promise<void> {
    for (const key of [...store.keys()]) del(key);
  },
  async getAllKeys(): Promise<string[]> {
    return [...store.keys()];
  },
  async multiGet(keys: string[]): Promise<Array<[string, string | null]>> {
    return keys.map((k) => [k, store.get(k) ?? null]);
  },
  async multiSet(pairs: Array<[string, string]>): Promise<void> {
    for (const [k, v] of pairs) set(k, v);
  },
  async multiRemove(keys: string[]): Promise<void> {
    for (const k of keys) del(k);
  },
};

/** Start a load: optional initial contents, and an optional listener for every write. */
export function resetAsyncStorage(
  initial: Record<string, string> = {},
  listener: ((key: string, value: string | null) => void) | null = null,
): void {
  store.clear();
  for (const [k, v] of Object.entries(initial)) store.set(k, v);
  onChange = listener;
}

export default AsyncStorage;
