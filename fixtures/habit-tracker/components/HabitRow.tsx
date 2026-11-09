import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { Pressable, Text, View } from "react-native";
import type { Habit } from "../data/schema";
import { useTheme } from "../theme/ThemeProvider";

export function HabitRow({
  habit,
  done,
  streak,
  onToggle,
}: {
  habit: Habit;
  done: boolean;
  streak: number;
  onToggle: () => void;
}) {
  const theme = useTheme();
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: theme.spacing.md,
        backgroundColor: theme.colors.surface,
        borderRadius: theme.radius.md,
        borderWidth: 1,
        borderColor: theme.colors.border,
        padding: theme.spacing.md,
      }}
    >
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: theme.radius.sm,
          backgroundColor: theme.colors.surfaceAlt,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Ionicons name={habit.icon as "leaf-outline"} size={22} color={theme.colors.primary} />
      </View>
      <Link href={{ pathname: "/habit/[id]", params: { id: habit.id } }} asChild>
        <Pressable style={{ flex: 1 }}>
          <Text
            style={{
              color: theme.colors.text,
              fontSize: theme.font.size.title,
              fontWeight: theme.font.weight.medium,
            }}
          >
            {habit.name}
          </Text>
          <Text
            style={{
              color: theme.colors.textMuted,
              fontSize: theme.font.size.caption,
              marginTop: 2,
            }}
          >
            {streak > 0 ? `${streak}-day streak` : "Start a streak today"}
          </Text>
        </Pressable>
      </Link>
      <Pressable
        onPress={onToggle}
        accessibilityRole="checkbox"
        accessibilityState={{ checked: done }}
        style={{
          width: 32,
          height: 32,
          borderRadius: theme.radius.pill,
          borderWidth: 2,
          borderColor: done ? theme.colors.success : theme.colors.border,
          backgroundColor: done ? theme.colors.success : "transparent",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {done ? <Ionicons name="checkmark" size={18} color={theme.colors.onPrimary} /> : null}
      </Pressable>
    </View>
  );
}

export function streakFor(habitId: string, dates: Set<string>): number {
  let streak = 0;
  const day = new Date();
  for (;;) {
    const iso = day.toISOString().slice(0, 10);
    if (!dates.has(`${habitId}:${iso}`)) break;
    streak += 1;
    day.setDate(day.getDate() - 1);
  }
  return streak;
}
