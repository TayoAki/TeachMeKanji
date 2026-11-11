// TEMPLATE FILE — owned by the platform, never written by the model.
// Images: <AiImage name="hero" /> shows an image added to the project (data/images.ts);
// <AiImage prompt="..." /> generates one through ImageKit (https://imagekit.io), which caches it
// by URL. Without either, a themed placeholder.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { View, type ImageStyle } from "react-native";
import { images } from "../data/backend";
import { appImages } from "../data/images";
import { useTheme } from "../theme/ThemeProvider";

/** FNV-1a: a short, stable id for a prompt (ImageKit caches each path forever). */
function promptHash(prompt: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < prompt.length; i++) {
    hash ^= prompt.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

export function aiImageUrl(prompt: string, width = 800, height = 600): string | null {
  if (!images.endpoint) return null;
  const slug =
    prompt
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .slice(0, 40) || "image";
  return `${images.endpoint}/ik-genimg-prompt-${encodeURIComponent(prompt)}/${slug}-${promptHash(prompt)}.jpg?tr=w-${width},h-${height}`;
}

export function AiImage({
  name,
  prompt,
  fit = "cover",
  style,
}: {
  /** An image added to the project (see data/images.ts). */
  name?: string;
  /** Or a short visual description to generate one from. */
  prompt?: string;
  /** "contain" for a character or cut-out picture: shown whole, with nothing behind it. */
  fit?: "cover" | "contain";
  style?: ImageStyle;
}) {
  const theme = useTheme();
  const url = (name ? appImages[name] : undefined) ?? (prompt ? aiImageUrl(prompt) : null);
  const label = prompt ?? name ?? "image";
  if (!url) {
    return (
      <View
        accessibilityLabel={label}
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
      accessibilityLabel={label}
      contentFit={fit}
      style={[
        {
          height: 160,
          backgroundColor: fit === "contain" ? "transparent" : theme.colors.surfaceAlt,
        },
        style,
      ]}
    />
  );
}
