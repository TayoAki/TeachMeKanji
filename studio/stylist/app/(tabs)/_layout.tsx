import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTheme } from "../../theme/ThemeProvider";

const TABS: { name: string; title: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { name: "index", title: "Today", icon: "sunny-outline" },
  { name: "closet", title: "Closet", icon: "shirt-outline" },
  { name: "scan", title: "Scan", icon: "scan-outline" },
  { name: "looks", title: "Looks", icon: "albums-outline" },
];

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        animation: "shift",
        tabBarActiveTintColor: theme.colors.text,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarLabelStyle: {
          fontSize: theme.font.size.caption,
          fontWeight: theme.font.weight.medium,
        },
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
      }}
    >
      {TABS.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarIcon: ({ color, size }) => (
              <Ionicons name={tab.icon} color={color as string} size={size} />
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
