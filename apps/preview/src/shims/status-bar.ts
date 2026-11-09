import { useEffect } from "react";

type Style = "auto" | "light" | "dark" | "inverted";
type Listener = (style: Style) => void;

let current: Style = "auto";
const listeners = new Set<Listener>();

export function subscribeStatusBar(listener: Listener): () => void {
  listeners.add(listener);
  listener(current);
  return () => listeners.delete(listener);
}

/** expo-status-bar: only `style` matters for the simulated status bar. */
export function StatusBar({ style = "auto" }: { style?: Style }) {
  useEffect(() => {
    current = style;
    listeners.forEach((l) => l(style));
  }, [style]);
  return null;
}
