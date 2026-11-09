// TEMPLATE FILE — owned by the platform, never written by the model.
// Screens read and write data only through useCollection(). The repository behind it is
// local (AsyncStorage) by default and becomes remote when a backend is connected, without
// any screen changing.
import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { localRepository } from "./local";

export interface Record_ {
  id: string;
}

export interface Repository {
  list<T extends Record_>(collection: string): Promise<T[]>;
  put<T extends Record_>(collection: string, item: T): Promise<void>;
  remove(collection: string, id: string): Promise<void>;
  subscribe(collection: string, listener: () => void): () => void;
}

const RepositoryContext = createContext<Repository>(localRepository);

export function DataProvider({
  children,
  repository = localRepository,
}: {
  children: ReactNode;
  repository?: Repository;
}) {
  return createElement(RepositoryContext.Provider, { value: repository }, children);
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function useCollection<T extends Record_>(collection: string) {
  const repository = useContext(RepositoryContext);
  const [items, setItems] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () =>
      repository.list<T>(collection).then((rows) => {
        if (!alive) return;
        setItems(rows);
        setLoading(false);
      });
    load();
    const unsubscribe = repository.subscribe(collection, load);
    return () => {
      alive = false;
      unsubscribe();
    };
  }, [repository, collection]);

  const add = useCallback(
    (item: Omit<T, "id"> & { id?: string }) => {
      const record = { ...item, id: item.id ?? newId() } as T;
      return repository.put(collection, record).then(() => record);
    },
    [repository, collection],
  );

  const update = useCallback(
    (id: string, patch: Partial<T>) => {
      const current = items.find((item) => item.id === id);
      if (!current) return Promise.resolve();
      return repository.put(collection, { ...current, ...patch, id });
    },
    [repository, collection, items],
  );

  const remove = useCallback(
    (id: string) => repository.remove(collection, id),
    [repository, collection],
  );

  return { items, loading, add, update, remove };
}
