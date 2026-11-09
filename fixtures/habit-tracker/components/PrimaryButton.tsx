import { Pressable, Text } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export function PrimaryButton({
  label,
  onPress,
  disabled,
  tone = "primary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "danger";
}) {
  const theme = useTheme();
  const background = tone === "danger" ? theme.colors.danger : theme.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => ({
        backgroundColor: background,
        opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
        borderRadius: theme.radius.pill,
        paddingVertical: theme.spacing.md,
        alignItems: "center",
      })}
    >
      <Text
        style={{
          color: theme.colors.onPrimary,
          fontSize: theme.font.size.title,
          fontWeight: theme.font.weight.bold,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
