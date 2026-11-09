import { Ionicons } from "@expo/vector-icons";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { PrimaryButton } from "../components/PrimaryButton";
import { useCollection } from "../data/repo";
import type { Habit } from "../data/schema";
import { useTheme } from "../theme/ThemeProvider";

const ICONS = [
  "water-outline",
  "walk-outline",
  "book-outline",
  "leaf-outline",
  "bed-outline",
  "barbell-outline",
] as const;

export default function AddHabitScreen() {
  const theme = useTheme();
  const habits = useCollection<Habit>("habits");
  const [name, setName] = useState("");
  const [icon, setIcon] = useState<(typeof ICONS)[number]>(ICONS[0]);
  const [goal, setGoal] = useState(5);

  const save = async () => {
    await habits.add({
      name: name.trim(),
      icon,
      goalPerWeek: goal,
      createdAt: new Date().toISOString(),
    });
    router.back();
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ padding: theme.spacing.md, gap: theme.spacing.lg }}
    >
      <Stack.Screen options={{ title: "New habit" }} />
      <View style={{ gap: theme.spacing.sm }}>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.caption }}>
          NAME
        </Text>
        <TextInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. Stretch for 10 minutes"
          placeholderTextColor={theme.colors.textMuted}
          style={{
            color: theme.colors.text,
            fontSize: theme.font.size.title,
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderWidth: 1,
            borderRadius: theme.radius.md,
            padding: theme.spacing.md,
          }}
        />
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.caption }}>
          ICON
        </Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {ICONS.map((option) => (
            <Pressable
              key={option}
              onPress={() => setIcon(option)}
              style={{
                width: 52,
                height: 52,
                borderRadius: theme.radius.md,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: option === icon ? theme.colors.primary : theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Ionicons
                name={option}
                size={24}
                color={option === icon ? theme.colors.onPrimary : theme.colors.text}
              />
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: theme.spacing.sm }}>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.caption }}>
          TIMES PER WEEK
        </Text>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          {[1, 2, 3, 4, 5, 6, 7].map((n) => (
            <Pressable
              key={n}
              onPress={() => setGoal(n)}
              style={{
                flex: 1,
                paddingVertical: theme.spacing.sm,
                borderRadius: theme.radius.sm,
                alignItems: "center",
                backgroundColor: n === goal ? theme.colors.primary : theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <Text
                style={{
                  color: n === goal ? theme.colors.onPrimary : theme.colors.text,
                  fontWeight: theme.font.weight.medium,
                }}
              >
                {n}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <PrimaryButton label="Save habit" onPress={save} disabled={name.trim().length === 0} />
    </ScrollView>
  );
}
