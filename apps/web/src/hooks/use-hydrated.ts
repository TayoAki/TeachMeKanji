import { useSyncExternalStore } from "react";

const subscribe = () => () => {};

/**
 * False in the server render and until hydration, then true. Forms keep their submit button
 * disabled until then: a submit before hydration would be a native GET, putting the fields
 * (a password, say) in the URL.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => true,
    () => false,
  );
}
