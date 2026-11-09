// TEMPLATE FILE — owned by the platform, never written by the model.
// Every theme pack in theme/tokens.ts must provide exactly these keys, which is what lets
// the preview switch themes instantly without regenerating any screen.

export interface ThemeColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  border: string;
  text: string;
  textMuted: string;
  primary: string;
  onPrimary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
}

export interface Theme {
  id: string;
  name: string;
  dark: boolean;
  colors: ThemeColors;
  radius: { sm: number; md: number; lg: number; pill: number };
  spacing: { xs: number; sm: number; md: number; lg: number; xl: number };
  font: {
    family?: string;
    size: { caption: number; body: number; title: number; headline: number; display: number };
    weight: { regular: "400"; medium: "500"; bold: "700" };
  };
}
