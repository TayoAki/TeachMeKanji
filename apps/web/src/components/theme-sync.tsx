"use client";

import { useLayoutEffect } from "react";
import { applySavedTheme } from "@/lib/theme";

/**
 * The inline script in the root layout applies the saved theme before the first paint. When
 * React renders <html> on the client instead of hydrating it (not-found pages do), it resets
 * the class; this puts the saved theme back before the browser paints.
 */
export function ThemeSync() {
  useLayoutEffect(() => applySavedTheme(), []);
  return null;
}
