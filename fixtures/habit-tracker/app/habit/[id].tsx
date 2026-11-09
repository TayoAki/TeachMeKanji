import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { Card } from "../../components/Card";
import { PrimaryButton } from "../../components/PrimaryButton";
import { useCollection } from "../../data/repo";
import type { Checkin, Habit } from "../../data/schema";
import { useTheme } from "../../theme/ThemeProvider";

export default function HabitDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const habits = useCollection<Habit>("habits");
  const checkins = useCollection<Checkin>("checkins");
  const habit = habits.items.find((h) => h.id === id);
  const history = checkins.items
    .filter((c) => c.habitId === id)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (!habit) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: theme.colors.background,
        }}
      >
        <Text style={{ color: theme.colors.textMuted }}>
          {habits.loading ? "Loading…" : "Habit not found"}
        </Text>
      </View>
    );
  }

  const deleteHabit = async () => {
    await Promise.all(history.map((c) => checkins.remove(c.id)));
    await habits.remove(habit.id);
    router.back();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.md, gap: theme.spacing.md }}
    >
      <Stack.Screen options={{ title: habit.name }} />
      <View
        style={{ alignItems: "center", gap: theme.spacing.sm, paddingVertical: theme.spacing.lg }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: theme.radius.lg,
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={habit.icon as "leaf-outline"} size={36} color={theme.colors.primary} />
        </View>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.font.size.headline,
            fontWeight: theme.font.weight.bold,
          }}
        >
          {habit.name}
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.body }}>
          Goal: {habit.goalPerWeek} times a week
        </Text>
      </View>

      <Card>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.font.size.title,
            fontWeight: theme.font.weight.medium,
            marginBottom: theme.spacing.sm,
          }}
        >
          History
        </Text>
        {history.length === 0 ? (
          <Text style={{ color: theme.colors.textMuted }}>No check-ins yet.</Text>
        ) : (
          history.map((c) => (
            <View
              key={c.id}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: theme.spacing.sm,
                paddingVertical: theme.spacing.xs,
              }}
            >
              <Ionicons name="checkmark-circle" size={18} color={theme.colors.success} />
              <Text style={{ color: theme.colors.text, fontSize: theme.font.size.body }}>
                {c.date}
              </Text>
            </View>
          ))
        )}
      </Card>

      <PrimaryButton label="Delete habit" tone="danger" onPress={deleteHabit} />
    </ScrollView>
  );
}
