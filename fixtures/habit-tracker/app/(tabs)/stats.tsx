import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "../../components/Card";
import { useCollection } from "../../data/repo";
import { daysAgoISO, type Checkin, type Habit } from "../../data/schema";
import { useTheme } from "../../theme/ThemeProvider";

const WEEK = Array.from({ length: 7 }, (_, i) => daysAgoISO(6 - i));

export default function StatsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const habits = useCollection<Habit>("habits");
  const checkins = useCollection<Checkin>("checkins");
  const done = new Set(checkins.items.map((c) => `${c.habitId}:${c.date}`));
  const totalThisWeek = checkins.items.filter((c) => WEEK.includes(c.date)).length;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.lg,
        paddingHorizontal: theme.spacing.md,
        paddingBottom: theme.spacing.xl,
        gap: theme.spacing.md,
      }}
    >
      <Text
        style={{
          color: theme.colors.text,
          fontSize: theme.font.size.display,
          fontWeight: theme.font.weight.bold,
        }}
      >
        Progress
      </Text>
      <Card>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.caption }}>
          This week
        </Text>
        <Text
          style={{
            color: theme.colors.text,
            fontSize: theme.font.size.headline,
            fontWeight: theme.font.weight.bold,
          }}
        >
          {totalThisWeek} check-ins
        </Text>
      </Card>

      {habits.items.map((habit) => {
        const count = WEEK.filter((day) => done.has(`${habit.id}:${day}`)).length;
        return (
          <Card key={habit.id}>
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                marginBottom: theme.spacing.sm,
              }}
            >
              <Text
                style={{
                  color: theme.colors.text,
                  fontSize: theme.font.size.title,
                  fontWeight: theme.font.weight.medium,
                }}
              >
                {habit.name}
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.body }}>
                {count}/{habit.goalPerWeek}
              </Text>
            </View>
            <View style={{ flexDirection: "row", gap: theme.spacing.xs }}>
              {WEEK.map((day) => (
                <View
                  key={day}
                  style={{
                    flex: 1,
                    height: 28,
                    borderRadius: theme.radius.sm,
                    backgroundColor: done.has(`${habit.id}:${day}`)
                      ? theme.colors.primary
                      : theme.colors.surfaceAlt,
                  }}
                />
              ))}
            </View>
          </Card>
        );
      })}
    </ScrollView>
  );
}
