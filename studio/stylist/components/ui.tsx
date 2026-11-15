// Closetcast's building blocks: editorial type, pill buttons, chips, item tiles and the flat-lay
// board an outfit is laid out on.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { useState, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { photoUri } from "../data/photos";
import type { Item } from "../data/schema";
import { useTheme } from "../theme/ThemeProvider";
import { GarmentArt } from "./GarmentArt";
import { PressScale, haptic } from "./motion";

/** The display face: a serif for titles and the numbers that matter. */
export const DISPLAY_FONT = Platform.select({
  ios: "Georgia",
  android: "serif",
  default: "Georgia",
});

export function Display({
  children,
  size = "display",
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  size?: "display" | "headline" | "title";
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  return (
    <Text
      accessibilityRole={size === "display" ? "header" : undefined}
      numberOfLines={numberOfLines}
      style={[
        {
          fontFamily: DISPLAY_FONT,
          fontSize: theme.font.size[size],
          lineHeight: Math.round(theme.font.size[size] * 1.18),
          color: color ?? theme.colors.text,
          fontWeight: theme.font.weight.regular,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Eyebrow({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
}) {
  const theme = useTheme();
  return (
    <Text
      style={[
        {
          fontSize: theme.font.size.caption,
          letterSpacing: 1.4,
          textTransform: "uppercase",
          fontWeight: theme.font.weight.bold,
          color: theme.colors.textMuted,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Body({
  children,
  muted,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  muted?: boolean;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const theme = useTheme();
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        {
          fontSize: theme.font.size.body,
          lineHeight: Math.round(theme.font.size.body * 1.45),
          color: muted ? theme.colors.textMuted : theme.colors.text,
        },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
          gap: theme.spacing.sm,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function Button({
  label,
  onPress,
  kind = "filled",
  icon,
  disabled,
  loading,
  style,
}: {
  label: string;
  onPress: () => void;
  kind?: "filled" | "outline" | "text";
  icon?: keyof typeof Ionicons.glyphMap;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const filled = kind === "filled";
  const color = filled ? theme.colors.onPrimary : theme.colors.text;
  return (
    <PressScale
      onPress={disabled || loading ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(disabled), busy: Boolean(loading) }}
      haptic={filled ? "light" : undefined}
      style={[
        {
          minHeight: kind === "text" ? 44 : 52,
          borderRadius: theme.radius.pill,
          paddingHorizontal: theme.spacing.lg,
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "row",
          gap: theme.spacing.sm,
          backgroundColor: filled ? theme.colors.primary : "transparent",
          borderWidth: kind === "outline" ? 1.5 : 0,
          borderColor: theme.colors.text,
          opacity: disabled ? 0.45 : 1,
        },
        style,
      ]}
    >
      {icon ? <Ionicons name={icon} size={18} color={color} /> : null}
      <Text
        style={{
          fontSize: theme.font.size.body,
          fontWeight: theme.font.weight.bold,
          color,
          textDecorationLine: kind === "text" ? "underline" : "none",
        }}
      >
        {loading ? "Working on it…" : label}
      </Text>
    </PressScale>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  role = "checkbox",
  swatch,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  role?: "checkbox" | "radio";
  /** A garment color shown as a dot before the label. */
  swatch?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic("selection");
        onPress();
      }}
      accessibilityRole={role}
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      hitSlop={6}
      style={({ pressed }) => ({
        minHeight: 40,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.pill,
        borderWidth: 1.5,
        borderColor: selected ? theme.colors.text : theme.colors.border,
        backgroundColor: selected ? theme.colors.surfaceAlt : theme.colors.surface,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        opacity: pressed ? 0.8 : 1,
      })}
    >
      {selected ? <Ionicons name="checkmark" size={16} color={theme.colors.text} /> : null}
      {swatch ? (
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: swatch,
            borderWidth: 1,
            borderColor: theme.colors.border,
          }}
        />
      ) : null}
      <Text
        style={{
          fontSize: theme.font.size.body - 1,
          fontWeight: selected ? theme.font.weight.bold : theme.font.weight.medium,
          color: theme.colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A piece of clothing: its photo, or a drawing of it in its colors on a soft tile. */
export function ItemArt({
  item,
  size,
}: {
  item: Pick<Item, "category" | "colors" | "photoUri"> & { name?: string };
  size: number;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: theme.radius.md,
        backgroundColor: theme.colors.surfaceAlt,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      {item.photoUri ? (
        <Image
          source={{ uri: photoUri(item.photoUri) }}
          style={{ width: size, height: size }}
          contentFit="cover"
          accessibilityIgnoresInvertColors
        />
      ) : (
        <GarmentArt
          category={item.category}
          colors={item.colors}
          name={item.name}
          size={size * 0.78}
        />
      )}
    </View>
  );
}

/** An outfit laid out flat: the main pieces large, shoes and extras smaller below them. */
export function OutfitBoard({ items, width }: { items: Item[]; width: number }) {
  const theme = useTheme();
  // The board measures the space it really has (card borders and padding vary).
  const [measured, setMeasured] = useState<number | null>(null);
  const space = Math.floor(measured ?? width) - 1;
  const main = items.filter((i) => ["top", "bottom", "dress", "outerwear"].includes(i.category));
  const small = items.filter((i) => !main.includes(i));
  const gap = theme.spacing.sm;
  const perRow = main.length >= 3 ? 3 : 2;
  const big = Math.floor((space - gap * (perRow - 1)) / perRow);
  const little = Math.floor((space - gap * 3) / 4);
  return (
    <View style={{ gap }} onLayout={(e) => setMeasured(e.nativeEvent.layout.width)}>
      <View style={{ flexDirection: "row", gap, flexWrap: "wrap" }}>
        {main.map((item) => (
          <ItemArt key={item.id} item={item} size={big} />
        ))}
      </View>
      {small.length ? (
        <View style={{ flexDirection: "row", gap }}>
          {small.map((item) => (
            <ItemArt key={item.id} item={item} size={little} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

export function IconButton({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: 22,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.border,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Ionicons name={icon} size={20} color={theme.colors.text} />
    </Pressable>
  );
}

/** A row in a grouped list: icon tile, title, one-line purpose, chevron. */
export function Row({
  icon,
  title,
  detail,
  onPress,
  right,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail?: string;
  onPress?: () => void;
  right?: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={detail ? `${title}. ${detail}` : title}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.md,
        paddingVertical: theme.spacing.sm + 2,
        opacity: pressed ? 0.7 : 1,
        minHeight: 56,
      })}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.colors.surfaceAlt,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={icon} size={20} color={theme.colors.text} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text
          style={{
            fontSize: theme.font.size.body,
            fontWeight: theme.font.weight.medium,
            color: theme.colors.text,
          }}
        >
          {title}
        </Text>
        {detail ? (
          <Text style={{ fontSize: theme.font.size.caption + 1, color: theme.colors.textMuted }}>
            {detail}
          </Text>
        ) : null}
      </View>
      {right ??
        (onPress ? (
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
        ) : null)}
    </Pressable>
  );
}

/** A tappable tile that can be selected: a drawing or photo above a short label. */
export function SelectTile({
  label,
  selected,
  onPress,
  width,
  children,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  width: number;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={() => {
        haptic("selection");
        onPress();
      }}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width,
        padding: theme.spacing.sm,
        gap: 4,
        alignItems: "center",
        borderRadius: theme.radius.md,
        borderWidth: 1.5,
        borderColor: selected ? theme.colors.text : theme.colors.border,
        backgroundColor: selected ? theme.colors.surfaceAlt : theme.colors.surface,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {children}
      <Text
        numberOfLines={2}
        style={{ fontSize: theme.font.size.caption, color: theme.colors.text, textAlign: "center" }}
      >
        {label}
      </Text>
      {selected ? (
        <View style={{ position: "absolute", top: 6, right: 6 }}>
          <Ionicons name="checkmark-circle" size={20} color={theme.colors.text} />
        </View>
      ) : null}
    </Pressable>
  );
}
