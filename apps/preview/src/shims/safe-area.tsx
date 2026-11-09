import { createContext, useContext, type ReactNode } from "react";
import { View, type ViewProps } from "react-native";

export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

// Simulated device insets: status bar on top, home indicator at the bottom.
export const PREVIEW_INSETS: EdgeInsets = { top: 44, right: 0, bottom: 20, left: 0 };

const InsetsContext = createContext<EdgeInsets>(PREVIEW_INSETS);

export function SafeAreaProvider({ children }: { children: ReactNode }) {
  return <InsetsContext.Provider value={PREVIEW_INSETS}>{children}</InsetsContext.Provider>;
}

export function useSafeAreaInsets(): EdgeInsets {
  return useContext(InsetsContext);
}

export function SafeAreaView({
  style,
  edges = ["top", "right", "bottom", "left"],
  ...rest
}: ViewProps & { edges?: Array<keyof EdgeInsets> }) {
  const insets = useSafeAreaInsets();
  const padding = {
    paddingTop: edges.includes("top") ? insets.top : 0,
    paddingBottom: edges.includes("bottom") ? insets.bottom : 0,
  };
  return <View {...rest} style={[padding, style]} />;
}
