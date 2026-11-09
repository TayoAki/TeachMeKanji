import { View, type ViewProps } from "react-native";

/** expo-linear-gradient on web: a View with a CSS linear-gradient background. */
export function LinearGradient({
  colors,
  start = { x: 0.5, y: 0 },
  end = { x: 0.5, y: 1 },
  style,
  ...rest
}: ViewProps & {
  colors: readonly string[];
  start?: { x: number; y: number };
  end?: { x: number; y: number };
}) {
  const angle = Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI) + 90;
  return (
    <View
      {...rest}
      style={[
        style,
        { backgroundImage: `linear-gradient(${angle}deg, ${colors.join(", ")})` } as object,
      ]}
    />
  );
}
