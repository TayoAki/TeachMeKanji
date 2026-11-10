// TEMPLATE FILE — owned by the platform, never written by the model.
// Which theme is on screen. The app's chosen theme (defaultThemeId) has a light or dark
// partner, and the app follows the phone's appearance unless the user picks Light or Dark
// (useAppearance(), saved on the device). The platform's preview can also show any theme
// from outside the app, instantly and without regenerating anything.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { defaultThemeId, themes } from "./tokens";
import type { Theme } from "./types";

export type Appearance = "system" | "light" | "dark";

type Listener = () => void;

const APPEARANCE_KEY = "app:appearance";
let baseThemeId: string = defaultThemeId;
let appearance: Appearance = "system";
/** The preview chose a theme to show; a saved appearance doesn't override that. */
let shown = false;
let version = 0;
const listeners = new Set<Listener>();

function changed() {
  version++;
  listeners.forEach((listener) => listener());
}

AsyncStorage.getItem(APPEARANCE_KEY)
  .then((saved) => {
    if (!shown && (saved === "light" || saved === "dark" || saved === "system")) {
      appearance = saved;
      changed();
    }
  })
  .catch(() => undefined);

/** The theme the app is set to (the platform's preview may change it). */
export function getActiveThemeId(): string {
  return baseThemeId;
}

/** Used by the platform's preview: show this theme (in its own light or dark mode). */
export function setActiveThemeId(id: string): void {
  const theme = themes.find((t) => t.id === id);
  if (!theme) return;
  baseThemeId = id;
  appearance = theme.dark ? "dark" : "light";
  shown = true;
  changed();
}

export function getAppearance(): Appearance {
  return appearance;
}

export function setAppearance(next: Appearance): void {
  if (next === appearance) return;
  appearance = next;
  AsyncStorage.setItem(APPEARANCE_KEY, next).catch(() => undefined);
  changed();
}

/** Changes whenever the theme or the appearance changes (for useSyncExternalStore). */
export function getThemeVersion(): number {
  return version;
}

export function subscribeActiveTheme(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The partner of a theme in the other mode: the nearest one in the list, the next first. */
function partner(index: number, dark: boolean): Theme | undefined {
  for (let step = 1; step < themes.length; step++) {
    for (const i of [index + step, index - step]) {
      if (themes[i] && themes[i]!.dark === dark) return themes[i];
    }
  }
  return undefined;
}

/** The theme to show for the phone's color scheme ("dark", "light" or unknown). */
export function resolveTheme(scheme: string | null | undefined): Theme {
  const index = Math.max(
    0,
    themes.findIndex((t) => t.id === baseThemeId),
  );
  const base = themes[index]!;
  const dark =
    appearance === "system"
      ? scheme === "dark" || (scheme !== "light" && base.dark)
      : appearance === "dark";
  return base.dark === dark ? base : (partner(index, dark) ?? base);
}
