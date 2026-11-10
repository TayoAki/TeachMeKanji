// TEMPLATE FILE — owned by the platform, never written by the model.
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import {
  getAppearance,
  getThemeVersion,
  resolveTheme,
  setAppearance,
  subscribeActiveTheme,
  type Appearance,
} from "./active";
import type { Theme } from "./types";

export type { Appearance };

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  useSyncExternalStore(subscribeActiveTheme, getThemeVersion, getThemeVersion);
  const scheme = useColorScheme();
  return <ThemeContext.Provider value={resolveTheme(scheme)}>{children}</ThemeContext.Provider>;
}

/** The active theme's tokens. Screens and components must take every color from here. */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme() must be used inside <ThemeProvider>");
  return theme;
}

/**
 * Light, dark, or follow the phone ("system", the default). Saved on the device. Use it for
 * an Appearance row in Settings: const [appearance, setAppearance] = useAppearance();
 */
export function useAppearance(): [Appearance, (next: Appearance) => void] {
  useSyncExternalStore(subscribeActiveTheme, getThemeVersion, getThemeVersion);
  return [getAppearance(), setAppearance];
}
