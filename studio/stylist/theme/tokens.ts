import type { Theme } from "./types";

const radius = { sm: 10, md: 16, lg: 24, pill: 999 };
const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
const font = {
  size: { caption: 12, body: 16, title: 18, headline: 24, display: 36 },
  weight: { regular: "400", medium: "500", bold: "700" },
} as const;

// Light and dark alternate, so each light theme's partner is the dark one next to it.
export const themes: Theme[] = [
  {
    id: "linen",
    name: "Linen",
    dark: false,
    colors: {
      background: "#F6F1EA",
      surface: "#FFFDF9",
      surfaceAlt: "#EDE5DA",
      border: "#E2D8CB",
      text: "#1D1814",
      textMuted: "#74695E",
      primary: "#1D1814",
      onPrimary: "#FBF7F1",
      accent: "#B5573B",
      success: "#3E7C5A",
      warning: "#B9822B",
      danger: "#B3261E",
    },
    radius,
    spacing,
    font,
  },
  {
    id: "noir",
    name: "Noir",
    dark: true,
    colors: {
      background: "#121011",
      surface: "#1C191A",
      surfaceAlt: "#272324",
      border: "#352F30",
      text: "#F4EEE6",
      textMuted: "#A89E93",
      primary: "#F4EEE6",
      onPrimary: "#121011",
      accent: "#E08A6B",
      success: "#6FBF8E",
      warning: "#E3B05A",
      danger: "#EF6F64",
    },
    radius,
    spacing,
    font,
  },
  {
    id: "sage",
    name: "Sage",
    dark: false,
    colors: {
      background: "#F2F4EE",
      surface: "#FFFFFF",
      surfaceAlt: "#E3E9DD",
      border: "#D4DCCB",
      text: "#1B231C",
      textMuted: "#5F6B5F",
      primary: "#2F4A3A",
      onPrimary: "#F2F4EE",
      accent: "#A86F32",
      success: "#2F7D4F",
      warning: "#B9822B",
      danger: "#B3261E",
    },
    radius,
    spacing,
    font,
  },
  {
    id: "midnight",
    name: "Midnight",
    dark: true,
    colors: {
      background: "#0F1320",
      surface: "#171C2C",
      surfaceAlt: "#20273B",
      border: "#2C344B",
      text: "#EEF0F7",
      textMuted: "#9AA3BC",
      primary: "#E9D8B4",
      onPrimary: "#14182A",
      accent: "#8FA8FF",
      success: "#6FC79A",
      warning: "#E8B867",
      danger: "#F07A7A",
    },
    radius,
    spacing,
    font,
  },
  {
    id: "blush",
    name: "Blush",
    dark: false,
    colors: {
      background: "#FBF1EF",
      surface: "#FFFFFF",
      surfaceAlt: "#F5E1DC",
      border: "#EBD3CD",
      text: "#2A1A1A",
      textMuted: "#7D6461",
      primary: "#2A1A1A",
      onPrimary: "#FBF1EF",
      accent: "#C4566A",
      success: "#3F8060",
      warning: "#C08A2E",
      danger: "#B3261E",
    },
    radius,
    spacing,
    font,
  },
];

export const defaultThemeId = "linen";

/**
 * Garment colors (the color of the clothes, not of the app's interface), by the color ids in
 * data/schema. Shown as swatches and in the closet's garment drawings.
 */
export const swatches: Record<string, string> = {
  black: "#1E1E1E",
  white: "#F5F3EF",
  cream: "#EDE3D1",
  beige: "#D6C3A5",
  camel: "#B88A56",
  brown: "#6B4A33",
  grey: "#8E9195",
  charcoal: "#3C3F44",
  navy: "#1F2E4D",
  denim: "#4A6A94",
  blue: "#3E7CC9",
  lightblue: "#A9C8E8",
  green: "#4E7A4F",
  olive: "#6E6B3A",
  sage: "#A3B59B",
  red: "#B83A3A",
  burgundy: "#6E2233",
  pink: "#E8A5B5",
  purple: "#6E4D8E",
  lavender: "#C2B3DD",
  yellow: "#E9C84A",
  orange: "#E07B39",
  gold: "#C9A24A",
  silver: "#BFC3C8",
  print: "#9C8E80",
};

/** Stitching and folds on a garment drawing: dark on light fabric, light on dark fabric. */
export const fabricLine = { onLight: "rgba(0,0,0,0.18)", onDark: "rgba(255,255,255,0.38)" };
