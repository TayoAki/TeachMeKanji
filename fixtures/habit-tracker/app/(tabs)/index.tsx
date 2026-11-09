import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { HabitRow, streakFor } from "../../components/HabitRow";
import { useCollection } from "../../data/repo";
import { todayISO, type Checkin, type Habit } from "../../data/schema";
import { useTheme } from "../../theme/ThemeProvider";

export default function TodayScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const habits = useCollection<Habit>("habits");
  const checkins = useCollection<Checkin>("checkins");
  const today = todayISO();

  const doneKeys = new Set(checkins.items.map((c) => `${c.habitId}:${c.date}`));
  const doneToday = habits.items.filter((h) => doneKeys.has(`${h.id}:${today}`)).length;
  const progress = habits.items.length === 0 ? 0 : doneToday / habits.items.length;

  const toggle = (habit: Habit) => {
    const existing = checkins.items.find((c) => c.habitId === habit.id && c.date === today);
    if (existing) checkins.remove(existing.id);
    else checkins.add({ habitId: habit.id, date: today });
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing.lg,
          paddingHorizontal: theme.spacing.md,
          paddingBottom: theme.spacing.xl * 3,
          gap: theme.spacing.md,
        }}
      >
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.body }}>
          {new Date().toLocaleDateString(undefined, {
            weekday: "long",
            month: "long",
            day: "numeric",
          })}
        </Text>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.font.size.display,
            fontWeight: theme.font.weight.bold,
          }}
        >
          Today
        </Text>

        <View
          style={{
            backgroundColor: theme.colors.primary,
            borderRadius: theme.radius.lg,
            padding: theme.spacing.lg,
            gap: theme.spacing.sm,
          }}
        >
          <Text
            style={{
              color: theme.colors.onPrimary,
              fontSize: theme.font.size.title,
              fontWeight: theme.font.weight.medium,
            }}
          >
            {doneToday} of {habits.items.length} habits done
          </Text>
          <View
            style={{
              height: 10,
              borderRadius: theme.radius.pill,
              backgroundColor: theme.colors.surfaceAlt,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                width: `${Math.round(progress * 100)}%`,
                height: "100%",
                backgroundColor: theme.colors.accent,
              }}
            />
          </View>
        </View>

        {habits.items.map((habit) => (
          <HabitRow
            key={habit.id}
            habit={habit}
            done={doneKeys.has(`${habit.id}:${today}`)}
            streak={streakFor(habit.id, doneKeys)}
            onToggle={() => toggle(habit)}
          />
        ))}
      </ScrollView>

      <Link href="/add-habit" asChild>
        <Pressable
          accessibilityLabel="Add habit"
          style={{
            position: "absolute",
            right: theme.spacing.lg,
            bottom: theme.spacing.lg,
            width: 56,
            height: 56,
            borderRadius: theme.radius.pill,
            backgroundColor: theme.colors.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="add" size={28} color={theme.colors.onPrimary} />
        </Pressable>
      </Link>
    </View>
  );
}
