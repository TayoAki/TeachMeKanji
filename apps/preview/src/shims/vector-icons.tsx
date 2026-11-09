import { Text, type TextStyle, type StyleProp } from "react-native";
import glyphMap from "@expo/vector-icons/build/vendor/react-native-vector-icons/glyphmaps/Ionicons.json";

// The Ionicons font is served by the preview origin and declared in index.html.
interface IconProps {
  name: string;
  size?: number;
  color?: string;
  style?: StyleProp<TextStyle>;
  dataSet?: Record<string, string>;
}

export function Ionicons({ name, size = 12, color, style, dataSet }: IconProps) {
  const code = (glyphMap as Record<string, number>)[name];
  return (
    <Text
      dataSet={dataSet}
      selectable={false}
      style={[
        {
          fontFamily: "Ionicons",
          fontSize: size,
          color,
          fontWeight: "normal",
          fontStyle: "normal",
          lineHeight: size,
        },
        style,
      ]}
    >
      {code ? String.fromCodePoint(code) : "?"}
    </Text>
  );
}
Ionicons.glyphMap = glyphMap;
