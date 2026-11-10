/**
 * App Builder brand kit for films. Tokens copied from apps/web/src/app/globals.css (.dark), the
 * product's default theme, and the Geist fonts from apps/web/src/app/layout.tsx.
 */
export const C = {
  background: "oklch(0.145 0 0)",
  foreground: "oklch(0.985 0 0)",
  card: "oklch(0.205 0 0)",
  popover: "oklch(0.205 0 0)",
  primary: "oklch(0.922 0 0)",
  primaryForeground: "oklch(0.205 0 0)",
  secondary: "oklch(0.269 0 0)",
  muted: "oklch(0.269 0 0)",
  mutedForeground: "oklch(0.708 0 0)",
  accent: "oklch(0.269 0 0)",
  destructive: "oklch(0.704 0.191 22.216)",
  border: "oklch(1 0 0 / 10%)",
  input: "oklch(1 0 0 / 15%)",
  ring: "oklch(0.556 0 0)",
  sidebar: "oklch(0.205 0 0)",
  // bg-muted/40 on the left rail
  rail: "oklch(0.269 0 0 / 40%)",
  // In-place edit outline in the preview runtime (apps/preview/src/selection.ts)
  editOutline: "#2563eb",
  selection: "rgba(59, 130, 246, 0.42)",
  // sonner richColors success toast (dark)
  toastBg: "hsl(150, 100%, 6%)",
  toastBorder: "hsl(147, 100%, 12%)",
  toastText: "hsl(150, 86%, 65%)",
  // The film's own backdrop outside the product (kinetic type, lockup): the product background.
  stage: "oklch(0.145 0 0)",
  // The generated app (Kanjiwa, Sumi Night theme) as captured
  appBg: "rgb(20, 19, 18)",
  appText: "rgb(242, 237, 228)",
  appGold: "rgb(212, 166, 74)",
} as const;

export const R = { sm: 6, md: 8, lg: 10, xl: 14, "2xl": 18 } as const;

export const FONT = {
  sans: "Geist, ui-sans-serif, system-ui, sans-serif",
  mono: "GeistMono, ui-monospace, monospace",
  /** The generated app's text renders in Inter on the capture machine (system font stack). */
  app: "InterFilm, sans-serif",
} as const;
