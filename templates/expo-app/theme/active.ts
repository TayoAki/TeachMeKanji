// TEMPLATE FILE — owned by the platform, never written by the model.
// The active theme id lives in a tiny external store so the platform's preview can switch
// themes from outside the app (instantly, no regeneration). In a shipped app it simply
// holds the default theme chosen at generation time.
import { defaultThemeId } from "./tokens";

type Listener = () => void;

let activeThemeId: string = defaultThemeId;
const listeners = new Set<Listener>();

export function getActiveThemeId(): string {
  return activeThemeId;
}

export function setActiveThemeId(id: string): void {
  if (id === activeThemeId) return;
  activeThemeId = id;
  listeners.forEach((listener) => listener());
}

export function subscribeActiveTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
