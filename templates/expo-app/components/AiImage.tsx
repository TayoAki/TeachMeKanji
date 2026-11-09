// TEMPLATE FILE — owned by the platform, never written by the model.
// AI-generated images through ImageKit (https://imagekit.io): the prompt is part of the URL
// and ImageKit generates and caches the image. Without an endpoint, a themed placeholder.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { View, type ImageStyle } from "react-native";
import { images } from "../data/backend";
import { useTheme } from "../theme/ThemeProvider";

export function aiImageUrl(prompt: string, width = 800, height = 600): string | null {
  if (!images.endpoint) return null;
  const name =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40) || "image";
  return `${images.endpoint}/ik-genimg-prompt-${encodeURIComponent(prompt)}/${name}.jpg?tr=w-${width},h-${height}`;
}

export function AiImage({ prompt, style }: { prompt: string; style?: ImageStyle }) {
  const theme = useTheme();
  const url = aiImageUrl(prompt);
  if (!url) {
    return (
      <View
        accessibilityLabel={prompt}
        style={[
          {
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
            height: 160,
          },
          style,
        ]}
      >
        <Ionicons name="image-outline" size={28} color={theme.colors.textMuted} />
      </View>
    );
  }
  return (
    <Image
      source={{ uri: url }}
      accessibilityLabel={prompt}
      contentFit="cover"
      style={[{ height: 160, backgroundColor: theme.colors.surfaceAlt }, style]}
    />
  );
}
