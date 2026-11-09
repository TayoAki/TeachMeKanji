// In-memory AsyncStorage. The preview frame is sandboxed with an opaque origin, so
// localStorage would throw; generated apps only ever see this async API anyway.
const store = new Map<string, string>();

const AsyncStorage = {
  async getItem(key: string): Promise<string | null> {
    return store.has(key) ? store.get(key)! : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    store.set(key, value);
  },
  async removeItem(key: string): Promise<void> {
    store.delete(key);
  },
  async mergeItem(key: string, value: string): Promise<void> {
    const current = store.has(key) ? JSON.parse(store.get(key)!) : {};
    store.set(key, JSON.stringify({ ...current, ...JSON.parse(value) }));
  },
  async clear(): Promise<void> {
    store.clear();
  },
  async getAllKeys(): Promise<string[]> {
    return [...store.keys()];
  },
  async multiGet(keys: string[]): Promise<Array<[string, string | null]>> {
    return keys.map((k) => [k, store.get(k) ?? null]);
  },
  async multiSet(pairs: Array<[string, string]>): Promise<void> {
    for (const [k, v] of pairs) store.set(k, v);
  },
  async multiRemove(keys: string[]): Promise<void> {
    for (const k of keys) store.delete(k);
  },
};

export function resetAsyncStorage(): void {
  store.clear();
}

export default AsyncStorage;
