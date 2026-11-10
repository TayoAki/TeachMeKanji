"use client";

import { useSyncExternalStore } from "react";

/**
 * The builder's color theme. Dark unless the user picks otherwise; the choice lives in
 * localStorage and an inline script in the root layout applies it before the first paint.
 */
export type ThemePreference = "dark" | "light" | "system";

export const THEME_KEY = "theme";
export const DEFAULT_THEME: ThemePreference = "dark";

/** Runs in <head> before paint; keep it in step with apply() below. */
export const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("${THEME_KEY}")||"${DEFAULT_THEME}";var d=p==="dark"||(p==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var e=document.documentElement;e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(e){}})()`;

const listeners = new Set<() => void>();

function read(): ThemePreference {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return value === "light" || value === "system" || value === "dark" ? value : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

function systemDark(): boolean {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false;
}

function apply(preference: ThemePreference) {
  const dark = preference === "dark" || (preference === "system" && systemDark());
  document.documentElement.classList.toggle("dark", dark);
  document.documentElement.style.colorScheme = dark ? "dark" : "light";
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const media = window.matchMedia?.("(prefers-color-scheme: dark)");
  const onSystem = () => {
    if (read() === "system") {
      apply("system");
      listener();
    }
  };
  const onStorage = (event: StorageEvent) => {
    if (event.key !== THEME_KEY) return;
    apply(read());
    listener();
  };
  media?.addEventListener("change", onSystem);
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    media?.removeEventListener("change", onSystem);
    window.removeEventListener("storage", onStorage);
  };
}

/** Apply the saved choice again (React can re-render <html> on the client, e.g. on a 404). */
export function applySavedTheme() {
  apply(read());
  listeners.forEach((listener) => listener());
}

export function setThemePreference(preference: ThemePreference) {
  try {
    localStorage.setItem(THEME_KEY, preference);
  } catch {
    // private mode: still switch for this page
  }
  apply(preference);
  listeners.forEach((listener) => listener());
}

/** The user's choice ("system" included). */
export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, read, () => DEFAULT_THEME);
}

/** What is on screen right now: "dark" or "light". */
export function useResolvedTheme(): "dark" | "light" {
  return useSyncExternalStore(
    subscribe,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => (DEFAULT_THEME === "light" ? "light" : "dark"),
  );
}
