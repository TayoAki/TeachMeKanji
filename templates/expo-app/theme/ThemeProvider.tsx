// TEMPLATE FILE — owned by the platform, never written by the model.
import { createContext, useContext, useSyncExternalStore, type ReactNode } from "react";
import { getActiveThemeId, subscribeActiveTheme } from "./active";
import { themes } from "./tokens";
import type { Theme } from "./types";

const ThemeContext = createContext<Theme | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const themeId = useSyncExternalStore(subscribeActiveTheme, getActiveThemeId, getActiveThemeId);
  const theme = themes.find((t) => t.id === themeId) ?? themes[0]!;
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

/** The active theme's tokens. Screens and components must take every color from here. */
export function useTheme(): Theme {
  const theme = useContext(ThemeContext);
  if (!theme) throw new Error("useTheme() must be used inside <ThemeProvider>");
  return theme;
}
