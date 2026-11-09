/**
 * OFFLINE PROVIDER: a deterministic stand-in for Claude, used by automated tests and for
 * running the product without an API key (LLM_PROVIDER=fake). It is not AI: it answers the
 * same requests with template-based plans and code, in the same wire formats (plan JSON,
 * <file> blocks), so every other part of the pipeline runs for real.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { AppPlan, PlanScreen } from "@appbuilder/contract";
import { slugify } from "@appbuilder/contract";
import type { CreateMessage } from "./client";
import { formatFileBlocks } from "./files";

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

export const FAKE_MODEL = "offline-template-generator";

export const fakeCreateMessage: CreateMessage = async (params) => {
  await new Promise((resolve) => setTimeout(resolve, Number(process.env.FAKE_LLM_DELAY_MS || 120)));
  return message(respond(params));
};

function message(text: string): Anthropic.Beta.Messages.BetaMessage {
  return {
    id: `msg_fake_${Date.now()}`,
    type: "message",
    role: "assistant",
    model: FAKE_MODEL,
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Beta.Messages.BetaMessage;
}

function lastUserText(params: Params): string {
  const last = [...params.messages].reverse().find((m) => m.role === "user");
  if (!last) return "";
  if (typeof last.content === "string") return last.content;
  return last.content.map((b) => (b.type === "text" ? b.text : "")).join("\n");
}

function systemText(params: Params): string {
  if (typeof params.system === "string") return params.system;
  return (params.system ?? []).map((b) => b.text).join("\n");
}

function respond(params: Params): string {
  const request = lastUserText(params);
  if (params.output_config?.format) return JSON.stringify(fakePlan(request));
  if (request.includes("Write the shared layer of this app"))
    return formatFileBlocks(sharedLayer(request));
  const screen = /Write the screen `([^`]+)` \("([^"]+)"/.exec(request);
  if (screen)
    return formatFileBlocks({
      [screen[1]!]: screenFile(screen[1]!, screen[2]!, systemText(params)),
    });
  if (request.includes("Change request:")) return fakeEdit(request, systemText(params));
  return "<summary>Nothing to change.</summary>";
}

// --- Domains -------------------------------------------------------------------------------

interface Domain {
  match: RegExp;
  appName: string;
  collection: string;
  singular: string;
  noun: string;
  titles: string[];
  details: string[];
  valueLabel: string;
  homeTitle: string;
  insightsTitle: string;
}

const DOMAINS: Domain[] = [
  {
    match: /expense|budget|spend|money|financ/i,
    appName: "Penny Wise",
    collection: "expenses",
    singular: "expense",
    noun: "Expense",
    titles: ["Groceries", "Coffee", "Train pass", "Dinner out", "Phone bill", "Books"],
    details: ["Food", "Food", "Transport", "Food", "Bills", "Leisure"],
    valueLabel: "Amount",
    homeTitle: "Expenses",
    insightsTitle: "Insights",
  },
  {
    match: /habit|routine|streak/i,
    appName: "Habit Loop",
    collection: "habits",
    singular: "habit",
    noun: "Habit",
    titles: ["Drink water", "Morning run", "Read 20 pages", "Meditate", "Stretch", "Journal"],
    details: ["Health", "Fitness", "Learning", "Mind", "Fitness", "Mind"],
    valueLabel: "Streak",
    homeTitle: "Today",
    insightsTitle: "Progress",
  },
  {
    match: /recipe|cook|meal|kitchen/i,
    appName: "Cook Book",
    collection: "recipes",
    singular: "recipe",
    noun: "Recipe",
    titles: ["Shakshuka", "Pad thai", "Lentil soup", "Banana bread", "Caesar salad", "Risotto"],
    details: ["Breakfast", "Dinner", "Lunch", "Baking", "Lunch", "Dinner"],
    valueLabel: "Minutes",
    homeTitle: "Recipes",
    insightsTitle: "Kitchen stats",
  },
  {
    match: /workout|fitness|gym|exercise/i,
    appName: "Rep Count",
    collection: "workouts",
    singular: "workout",
    noun: "Workout",
    titles: ["Leg day", "Upper body", "5k run", "Yoga flow", "HIIT", "Swim"],
    details: ["Strength", "Strength", "Cardio", "Mobility", "Cardio", "Cardio"],
    valueLabel: "Minutes",
    homeTitle: "Workouts",
    insightsTitle: "Stats",
  },
  {
    match: /todo|task|to-do|checklist/i,
    appName: "Task Flow",
    collection: "tasks",
    singular: "task",
    noun: "Task",
    titles: ["Pay rent", "Call mom", "Book dentist", "Plan trip", "Fix bike", "Renew passport"],
    details: ["Home", "Family", "Health", "Travel", "Home", "Admin"],
    valueLabel: "Priority",
    homeTitle: "Tasks",
    insightsTitle: "Overview",
  },
];

function domainFor(text: string): Domain {
  const found = DOMAINS.find((d) => d.match.test(text));
  if (found) return found;
  const word = (
    /(?:build|create|make)\s+(?:me\s+)?(?:an?\s+)?([a-z]+)/i.exec(text)?.[1] ?? "item"
  ).toLowerCase();
  const noun = word.charAt(0).toUpperCase() + word.slice(1);
  return {
    match: /./,
    appName: `${noun} Keeper`,
    collection: "items",
    singular: "item",
    noun: "Item",
    titles: ["First item", "Second item", "Third item", "Fourth item", "Fifth item", "Sixth item"],
    details: ["General", "General", "Work", "Personal", "Work", "Personal"],
    valueLabel: "Score",
    homeTitle: "Home",
    insightsTitle: "Insights",
  };
}

const THEMES = [
  { id: "mint", name: "Mint Leaf", mood: "fresh and calm", dark: false, primary: "#1F9D6B" },
  { id: "harbor", name: "Harbor Night", mood: "deep and focused", dark: true, primary: "#5B8CFF" },
  { id: "sunrise", name: "Sunrise", mood: "warm and upbeat", dark: false, primary: "#E8663D" },
  { id: "lavender", name: "Lavender", mood: "soft and friendly", dark: false, primary: "#6C4CF5" },
  { id: "graphite", name: "Graphite", mood: "minimal and bold", dark: true, primary: "#D9F99D" },
];

// --- Plan ----------------------------------------------------------------------------------

function fakePlan(request: string): AppPlan {
  const previousJson = /Current plan:\n([\s\S]*?)\n\nRequested changes:/.exec(request)?.[1];
  if (previousJson)
    return revisePlan(
      JSON.parse(previousJson) as AppPlan,
      /Requested changes: ([\s\S]*)$/.exec(request)?.[1] ?? "",
    );

  const idea = /App idea: (.*)/.exec(request)?.[1] ?? "";
  const d = domainFor(idea);
  const screens: PlanScreen[] = [
    {
      key: "home",
      title: d.homeTitle,
      kind: "tab",
      path: "app/(tabs)/index.tsx",
      purpose: `Lists your ${d.collection} with a summary card and a button to add one.`,
      icon: "home-outline",
    },
    {
      key: "insights",
      title: d.insightsTitle,
      kind: "tab",
      path: "app/(tabs)/insights.tsx",
      purpose: `Totals and a breakdown of your ${d.collection} by category.`,
      icon: "stats-chart-outline",
    },
    {
      key: "detail",
      title: `${d.noun} details`,
      kind: "stack",
      path: `app/${d.singular}/[id].tsx`,
      purpose: `Shows one ${d.singular} and lets you delete it.`,
      icon: "document-text-outline",
    },
    {
      key: "add",
      title: `New ${d.singular}`,
      kind: "stack",
      path: `app/add-${d.singular}.tsx`,
      purpose: `A form to add a ${d.singular}.`,
      icon: "add-circle-outline",
    },
    {
      key: "settings",
      title: "Settings",
      kind: "tab",
      path: "app/(tabs)/settings.tsx",
      purpose: "Preferences and a button to reset your data.",
      icon: "settings-outline",
    },
  ];
  const count = Number(
    /(\d+)\s+screens?/.exec(idea)?.[1] ?? (process.env.DEFAULT_SCREEN_COUNT || 3),
  );
  return {
    appName: d.appName,
    summary: `${d.appName} helps you keep track of your ${d.collection}, with quick entry and clear insights.`,
    screens: screens.slice(0, Math.max(2, Math.min(5, count))),
    collections: [
      {
        name: d.collection,
        description: `Your ${d.collection}.`,
        fields: [
          { name: "title", type: "string", description: "Name" },
          { name: "detail", type: "string", description: "Category" },
          { name: "value", type: "number", description: d.valueLabel },
          { name: "date", type: "date", description: "When" },
          { name: "done", type: "boolean", description: "Completed" },
        ],
      },
    ],
    themes: THEMES,
  };
}

function revisePlan(plan: AppPlan, feedback: string): AppPlan {
  const next: AppPlan = structuredClone(plan);
  const only =
    /(?:only|just|keep)\s+(?:the\s+)?(?:first\s+)?(\d+)/i.exec(feedback) ??
    /(\d+)\s+screens?/i.exec(feedback);
  if (only) next.screens = next.screens.slice(0, Math.max(2, Number(only[1])));
  const add = /add (?:an? )?([a-z ]+?) (?:screen|tab|page)/i.exec(feedback);
  if (add) {
    const title = add[1]!.trim().replace(/^\w/, (c) => c.toUpperCase());
    const key = slugify(title);
    next.screens.push({
      key,
      title,
      kind: "tab",
      path: `app/(tabs)/${key}.tsx`,
      purpose: `${title}.`,
      icon: "sparkles-outline",
    });
  }
  const rename = /(?:call it|name it|rename (?:it|the app) to)\s+"?([^".]+)"?/i.exec(feedback);
  if (rename) next.appName = rename[1]!.trim();
  return next;
}

// --- Shared layer --------------------------------------------------------------------------

function mix(hex: string, other: string, t: number): string {
  const a = hex.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const b = other.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return (
    "#" +
    a
      .map((v, i) =>
        Math.round(v + (b[i]! - v) * t)
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")
      .toUpperCase()
  );
}

function palette(primary: string, dark: boolean) {
  const base = dark ? "#0E1116" : "#FFFFFF";
  const ink = dark ? "#EEF1F6" : "#12161C";
  return {
    background: mix(base, primary, dark ? 0.04 : 0.05),
    surface: dark ? mix(base, primary, 0.1) : "#FFFFFF",
    surfaceAlt: mix(base, primary, dark ? 0.18 : 0.12),
    border: mix(base, primary, dark ? 0.25 : 0.18),
    text: ink,
    textMuted: mix(ink, base, 0.45),
    primary,
    onPrimary: dark ? "#0E1116" : "#FFFFFF",
    accent: mix(primary, dark ? "#FFB86B" : "#F2A93B", 0.6),
    success: dark ? "#4CD397" : "#1F9D6B",
    warning: dark ? "#FFB86B" : "#E08A1E",
    danger: dark ? "#FF6B6B" : "#D64545",
  };
}

function sharedLayer(request: string): Record<string, string> {
  const plan = JSON.parse(
    /Plan:\n([\s\S]*?)\n\nWrite the shared layer/.exec(request)![1]!,
  ) as AppPlan;
  const collection = plan.collections[0]!;
  const d = DOMAINS.find((x) => x.collection === collection.name) ?? domainFor(plan.appName);
  const noun = d.noun;

  const themes = plan.themes
    .map(
      (t) => `  {
    id: ${JSON.stringify(t.id)},
    name: ${JSON.stringify(t.name)},
    dark: ${t.dark},
    colors: ${JSON.stringify(palette(t.primary, t.dark), null, 6)
      .replace(/\n}/, "\n    }")
      .replace(/"(\w+)":/g, "$1:")},
    radius,
    spacing,
    font,
  }`,
    )
    .join(",\n");

  const tabs = plan.screens.filter((s) => s.kind === "tab");
  const tabScreens = tabs
    .map((t) => {
      const name = t.path.replace("app/(tabs)/", "").replace(".tsx", "");
      return `      <Tabs.Screen
        name=${JSON.stringify(name)}
        options={{
          title: ${JSON.stringify(t.title)},
          tabBarIcon: ({ color, size }) => <Ionicons name=${JSON.stringify(t.icon)} color={color as string} size={size} />,
        }}
      />`;
    })
    .join("\n");

  const records = d.titles
    .map(
      (title, i) =>
        `    { id: "${d.singular.charAt(0)}${i + 1}", title: ${JSON.stringify(title)}, detail: ${JSON.stringify(d.details[i])}, value: ${[12, 4, 30, 48, 25, 18][i]}, date: daysAgoISO(${i}), done: ${i % 2 === 0} }`,
    )
    .join(",\n");

  return {
    "theme/tokens.ts": `import type { Theme } from "./types";

const radius = { sm: 8, md: 14, lg: 20, pill: 999 };
const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 };
const font = {
  size: { caption: 12, body: 15, title: 17, headline: 22, display: 32 },
  weight: { regular: "400", medium: "500", bold: "700" },
} as const;

export const themes: Theme[] = [
${themes},
];

export const defaultThemeId = ${JSON.stringify(plan.themes[0]!.id)};
`,
    "data/schema.ts": `export interface ${noun} {
  id: string;
  title: string;
  /** ${d.details[0] ? "Category" : "Detail"} */
  detail: string;
  /** ${d.valueLabel} */
  value: number;
  /** ISO date (YYYY-MM-DD) */
  date: string;
  done: boolean;
}

export const VALUE_LABEL = ${JSON.stringify(d.valueLabel)};

export function daysAgoISO(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date.toISOString().slice(0, 10);
}

export function formatDate(iso: string): string {
  return new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
`,
    "data/seed.ts": `import { daysAgoISO, type ${noun} } from "./schema";

const ${collection.name}: ${noun}[] = [
${records},
];

export const seed = { ${collection.name} };
`,
    "app/(tabs)/_layout.tsx": `import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { useTheme } from "../../theme/ThemeProvider";

export default function TabsLayout() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.textMuted,
        tabBarStyle: { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
      }}
    >
${tabScreens}
    </Tabs>
  );
}
`,
    "components/Card.tsx": `import type { ReactNode } from "react";
import { View, type ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
          padding: theme.spacing.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}
`,
  };
}

// --- Screens -------------------------------------------------------------------------------

function contextInfo(system: string) {
  const seed = /<file path="data\/seed\.ts">([\s\S]*?)<\/file>/.exec(system)?.[1] ?? "";
  const collection = /export const seed = \{ (\w+) \}/.exec(seed)?.[1] ?? "items";
  const schema = /<file path="data\/schema\.ts">([\s\S]*?)<\/file>/.exec(system)?.[1] ?? "";
  const noun = /export interface (\w+)/.exec(schema)?.[1] ?? "Item";
  const detailRoute = /app\/(\w+)\/\[id\]\.tsx/.exec(system)?.[1];
  const addRoute = /app\/(add-[\w-]+)\.tsx/.exec(system)?.[1];
  return { collection, noun, detailRoute, addRoute };
}

const prefix = (path: string) => "../".repeat(path.split("/").length - 1);

function screenFile(path: string, title: string, system: string): string {
  const { collection, noun, detailRoute, addRoute } = contextInfo(system);
  const root = prefix(path);
  if (path === "app/(tabs)/index.tsx")
    return listScreen(root, title, collection, noun, detailRoute, addRoute);
  if (path.includes("[id]")) return detailScreen(root, collection, noun);
  if (path.startsWith("app/add-")) return formScreen(root, title, collection, noun);
  if (/settings/.test(path)) return settingsScreen(root, title, collection, noun);
  return statsScreen(root, title, collection, noun);
}

const head = (
  root: string,
  extra = "",
) => `import { ScrollView, Text, View${extra} } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card } from "${root}components/Card";
import { useCollection } from "${root}data/repo";
import { useTheme } from "${root}theme/ThemeProvider";`;

function listScreen(
  root: string,
  title: string,
  collection: string,
  noun: string,
  detail?: string,
  add?: string,
) {
  return `import { Ionicons } from "@expo/vector-icons";
import { Link } from "expo-router";
${head(root, ", Pressable")}
import { formatDate, VALUE_LABEL, type ${noun} } from "${root}data/schema";

export default function HomeScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { items, update } = useCollection<${noun}>(${JSON.stringify(collection)});
  const total = items.reduce((sum, item) => sum + item.value, 0);
  const done = items.filter((item) => item.done).length;

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
        <Text style={{ color: theme.colors.text, fontSize: theme.font.size.display, fontWeight: theme.font.weight.bold }}>
          ${title}
        </Text>
        <View style={{ backgroundColor: theme.colors.primary, borderRadius: theme.radius.lg, padding: theme.spacing.lg, gap: theme.spacing.xs }}>
          <Text style={{ color: theme.colors.onPrimary, fontSize: theme.font.size.caption }}>Total {VALUE_LABEL.toLowerCase()}</Text>
          <Text style={{ color: theme.colors.onPrimary, fontSize: theme.font.size.display, fontWeight: theme.font.weight.bold }}>{total}</Text>
          <Text style={{ color: theme.colors.onPrimary, fontSize: theme.font.size.body }}>
            {done} of {items.length} done
          </Text>
        </View>
        {items.map((item) => (
          <Card key={item.id} style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
            ${
              detail
                ? `<Link href={{ pathname: "/${detail}/[id]", params: { id: item.id } }} asChild>
              <Pressable style={{ flex: 1 }}>`
                : `<View style={{ flex: 1 }}>`
            }
                <Text style={{ color: theme.colors.text, fontSize: theme.font.size.title, fontWeight: theme.font.weight.medium }}>{item.title}</Text>
                <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.caption }}>
                  {item.detail} · {formatDate(item.date)}
                </Text>
              ${detail ? `</Pressable>\n            </Link>` : `</View>`}
            <Text style={{ color: theme.colors.text, fontWeight: theme.font.weight.bold }}>{item.value}</Text>
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: item.done }}
              onPress={() => update(item.id, { done: !item.done })}
              style={{
                width: 28,
                height: 28,
                borderRadius: theme.radius.pill,
                borderWidth: 2,
                borderColor: item.done ? theme.colors.success : theme.colors.border,
                backgroundColor: item.done ? theme.colors.success : "transparent",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {item.done ? <Ionicons name="checkmark" size={16} color={theme.colors.onPrimary} /> : null}
            </Pressable>
          </Card>
        ))}
      </ScrollView>
${
  add
    ? `      <Link href="/${add}" asChild>
        <Pressable
          accessibilityLabel="Add"
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
`
    : ""
}    </View>
  );
}
`;
}

function statsScreen(root: string, title: string, collection: string, noun: string) {
  return `${head(root)}
import { VALUE_LABEL, type ${noun} } from "${root}data/schema";

export default function StatsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { items } = useCollection<${noun}>(${JSON.stringify(collection)});
  const groups = new Map<string, number>();
  for (const item of items) groups.set(item.detail, (groups.get(item.detail) ?? 0) + item.value);
  const max = Math.max(1, ...groups.values());

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + theme.spacing.lg, paddingHorizontal: theme.spacing.md, paddingBottom: theme.spacing.xl, gap: theme.spacing.md }}
    >
      <Text style={{ color: theme.colors.text, fontSize: theme.font.size.display, fontWeight: theme.font.weight.bold }}>${title}</Text>
      <Card>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.caption }}>Entries</Text>
        <Text style={{ color: theme.colors.text, fontSize: theme.font.size.headline, fontWeight: theme.font.weight.bold }}>{items.length}</Text>
      </Card>
      <Card style={{ gap: theme.spacing.sm }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.font.size.title, fontWeight: theme.font.weight.medium }}>
          {VALUE_LABEL} by category
        </Text>
        {[...groups.entries()].map(([name, value]) => (
          <View key={name} style={{ gap: theme.spacing.xs }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
              <Text style={{ color: theme.colors.text }}>{name}</Text>
              <Text style={{ color: theme.colors.textMuted }}>{value}</Text>
            </View>
            <View style={{ height: 8, borderRadius: theme.radius.pill, backgroundColor: theme.colors.surfaceAlt, overflow: "hidden" }}>
              <View style={{ width: \`\${Math.round((value / max) * 100)}%\`, height: "100%", backgroundColor: theme.colors.primary }} />
            </View>
          </View>
        ))}
      </Card>
    </ScrollView>
  );
}
`;
}

function detailScreen(root: string, collection: string, noun: string) {
  return `import { Stack, router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, Text, View } from "react-native";
import { AiImage } from "${root}components/AiImage";
import { Card } from "${root}components/Card";
import { useCollection } from "${root}data/repo";
import { formatDate, VALUE_LABEL, type ${noun} } from "${root}data/schema";
import { useTheme } from "${root}theme/ThemeProvider";

export default function DetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, loading, remove } = useCollection<${noun}>(${JSON.stringify(collection)});
  const item = items.find((entry) => entry.id === id);

  if (!item) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: theme.colors.background }}>
        <Text style={{ color: theme.colors.textMuted }}>{loading ? "Loading…" : "Not found"}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
      <Stack.Screen options={{ title: item.title }} />
      <AiImage prompt={item.title} style={{ borderRadius: theme.radius.md }} />
      <Card style={{ gap: theme.spacing.sm }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.font.size.headline, fontWeight: theme.font.weight.bold }}>{item.title}</Text>
        <Text style={{ color: theme.colors.textMuted }}>{item.detail} · {formatDate(item.date)}</Text>
        <Text style={{ color: theme.colors.text, fontSize: theme.font.size.title }}>
          {VALUE_LABEL}: {item.value}
        </Text>
        <Text style={{ color: item.done ? theme.colors.success : theme.colors.textMuted }}>{item.done ? "Completed" : "Open"}</Text>
      </Card>
      <Pressable
        onPress={async () => {
          await remove(item.id);
          router.back();
        }}
        style={{ backgroundColor: theme.colors.danger, borderRadius: theme.radius.pill, padding: theme.spacing.md, alignItems: "center" }}
      >
        <Text style={{ color: theme.colors.onPrimary, fontWeight: theme.font.weight.bold }}>Delete</Text>
      </Pressable>
    </ScrollView>
  );
}
`;
}

function formScreen(root: string, title: string, collection: string, noun: string) {
  return `import { Stack, router } from "expo-router";
import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useCollection } from "${root}data/repo";
import { VALUE_LABEL, type ${noun} } from "${root}data/schema";
import { useTheme } from "${root}theme/ThemeProvider";

export default function AddScreen() {
  const theme = useTheme();
  const { add } = useCollection<${noun}>(${JSON.stringify(collection)});
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [value, setValue] = useState("");
  const input = {
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
    fontSize: theme.font.size.body,
  };

  const save = async () => {
    await add({ title: title.trim(), detail: detail.trim() || "General", value: Number(value) || 0, date: new Date().toISOString().slice(0, 10), done: false });
    router.back();
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.md, gap: theme.spacing.md }}>
      <Stack.Screen options={{ title: ${JSON.stringify(title)} }} />
      <View style={{ gap: theme.spacing.xs }}>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.caption }}>NAME</Text>
        <TextInput value={title} onChangeText={setTitle} placeholder="Name" placeholderTextColor={theme.colors.textMuted} style={input} />
      </View>
      <View style={{ gap: theme.spacing.xs }}>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.caption }}>CATEGORY</Text>
        <TextInput value={detail} onChangeText={setDetail} placeholder="Category" placeholderTextColor={theme.colors.textMuted} style={input} />
      </View>
      <View style={{ gap: theme.spacing.xs }}>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.caption }}>{VALUE_LABEL.toUpperCase()}</Text>
        <TextInput value={value} onChangeText={setValue} placeholder="0" keyboardType="numeric" placeholderTextColor={theme.colors.textMuted} style={input} />
      </View>
      <Pressable
        onPress={save}
        disabled={title.trim().length === 0}
        style={{ backgroundColor: theme.colors.primary, opacity: title.trim().length === 0 ? 0.5 : 1, borderRadius: theme.radius.pill, padding: theme.spacing.md, alignItems: "center" }}
      >
        <Text style={{ color: theme.colors.onPrimary, fontWeight: theme.font.weight.bold }}>Save</Text>
      </Pressable>
    </ScrollView>
  );
}
`;
}

function settingsScreen(root: string, title: string, collection: string, noun: string) {
  return `${head(root, ", Pressable, Switch")}
import { useState } from "react";
import type { ${noun} } from "${root}data/schema";

export default function SettingsScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { items, remove } = useCollection<${noun}>(${JSON.stringify(collection)});
  const [reminders, setReminders] = useState(true);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + theme.spacing.lg, paddingHorizontal: theme.spacing.md, gap: theme.spacing.md }}
    >
      <Text style={{ color: theme.colors.text, fontSize: theme.font.size.display, fontWeight: theme.font.weight.bold }}>${title}</Text>
      <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.font.size.title }}>Daily reminders</Text>
        <Switch value={reminders} onValueChange={setReminders} trackColor={{ true: theme.colors.primary, false: theme.colors.border }} />
      </Card>
      <Pressable
        onPress={() => items.forEach((item) => remove(item.id))}
        style={{ borderColor: theme.colors.danger, borderWidth: 1, borderRadius: theme.radius.pill, padding: theme.spacing.md, alignItems: "center" }}
      >
        <Text style={{ color: theme.colors.danger, fontWeight: theme.font.weight.bold }}>Reset all data</Text>
      </Pressable>
      <View style={{ height: theme.spacing.xl }} />
    </ScrollView>
  );
}
`;
}

// --- Edits ---------------------------------------------------------------------------------

function filesFromSystem(system: string): Record<string, string> {
  const files: Record<string, string> = {};
  for (const m of system.matchAll(/<file path="([^"]+)">\n([\s\S]*?)\n<\/file>/g))
    files[m[1]!] = m[2]!;
  return files;
}

function fakeEdit(request: string, system: string): string {
  const files = filesFromSystem(system);
  const ask = /Change request: (.*)/.exec(request)?.[1] ?? "";

  if (/sign[ -]?in|log[ -]?in|account/i.test(ask) && /screen|tab|page/i.test(ask)) {
    const enabled = /apiUrl: "[^"]+"/.test(files["data/backend.ts"] ?? "");
    if (!enabled) {
      return "<summary>Sign-in needs App Cloud. Enable it from the App Cloud panel first, then ask again.</summary>";
    }
    const layout = files["app/(tabs)/_layout.tsx"] ?? "";
    const entry = `      <Tabs.Screen
        name="account"
        options={{
          title: "Account",
          tabBarIcon: ({ color, size }) => <Ionicons name="person-circle-outline" color={color as string} size={size} />,
        }}
      />
    </Tabs>`;
    return `<summary>Added an Account tab where people can sign up, sign in and sign out with App Cloud.</summary>\n${formatFileBlocks(
      {
        "app/(tabs)/account.tsx": accountScreen(),
        "app/(tabs)/_layout.tsx": layout.replace("    </Tabs>", entry),
      },
    )}`;
  }

  const add = /add (?:an? |the )?([a-z ]+?) (?:screen|tab|page)/i.exec(ask);
  if (add) {
    const title = add[1]!.trim().replace(/^\w/, (c) => c.toUpperCase());
    const key = slugify(title);
    const path = `app/(tabs)/${key}.tsx`;
    const layout = files["app/(tabs)/_layout.tsx"] ?? "";
    const entry = `      <Tabs.Screen
        name=${JSON.stringify(key)}
        options={{
          title: ${JSON.stringify(title)},
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" color={color as string} size={size} />,
        }}
      />
    </Tabs>`;
    const { collection, noun } = contextInfo(system);
    const screen = /settings/i.test(title)
      ? settingsScreen("../../", title, collection, noun)
      : statsScreen("../../", title, collection, noun);
    return `<summary>Added a ${title} tab.</summary>\n${formatFileBlocks({
      [path]: screen,
      "app/(tabs)/_layout.tsx": layout.replace("    </Tabs>", entry),
    })}`;
  }

  const replace = /(?:change|rename|replace)\s+"([^"]+)"\s+(?:to|with)\s+"([^"]+)"/i.exec(ask);
  if (replace) {
    const [, from, to] = replace;
    const changed: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
      if ((path.startsWith("app/") || path.startsWith("components/")) && content.includes(from!)) {
        changed[path] = content.split(from!).join(to!);
      }
    }
    if (Object.keys(changed).length > 0) {
      return `<summary>Changed “${from}” to “${to}”.</summary>\n${formatFileBlocks(changed)}`;
    }
    return `<summary>I couldn't find “${from}” in the app.</summary>`;
  }

  return '<summary>Offline mode can only add screens ("add a settings screen") or replace text (change "A" to "B"). Connect an AI provider for other changes.</summary>';
}

function accountScreen() {
  return `import { useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../../data/auth";
import { useTheme } from "../../theme/ThemeProvider";

export default function AccountScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const auth = useAuth();
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-up");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const input = {
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: theme.radius.md,
    padding: theme.spacing.md,
  };

  const submit = async () => {
    setError(null);
    try {
      if (mode === "sign-up") await auth.signUp(email, password);
      else await auth.signIn(email, password);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{ paddingTop: insets.top + theme.spacing.lg, padding: theme.spacing.md, gap: theme.spacing.md }}
    >
      <Text style={{ color: theme.colors.text, fontSize: theme.font.size.display, fontWeight: theme.font.weight.bold }}>Account</Text>
      {auth.signedIn ? (
        <View style={{ gap: theme.spacing.md }}>
          <Text style={{ color: theme.colors.text, fontSize: theme.font.size.title }}>Signed in as {auth.user?.email}</Text>
          <Pressable onPress={auth.signOut} style={{ borderColor: theme.colors.border, borderWidth: 1, borderRadius: theme.radius.pill, padding: theme.spacing.md, alignItems: "center" }}>
            <Text style={{ color: theme.colors.text, fontWeight: theme.font.weight.bold }}>Sign out</Text>
          </Pressable>
        </View>
      ) : (
        <View style={{ gap: theme.spacing.sm }}>
          <Text style={{ color: theme.colors.textMuted }}>Sign up to keep your data on all your devices.</Text>
          <TextInput value={email} onChangeText={setEmail} placeholder="Email" autoCapitalize="none" placeholderTextColor={theme.colors.textMuted} style={input} />
          <TextInput value={password} onChangeText={setPassword} placeholder="Password" secureTextEntry placeholderTextColor={theme.colors.textMuted} style={input} />
          {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
          <Pressable onPress={submit} style={{ backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, padding: theme.spacing.md, alignItems: "center" }}>
            <Text style={{ color: theme.colors.onPrimary, fontWeight: theme.font.weight.bold }}>{mode === "sign-up" ? "Create account" : "Sign in"}</Text>
          </Pressable>
          <Pressable onPress={() => setMode(mode === "sign-up" ? "sign-in" : "sign-up")}>
            <Text style={{ color: theme.colors.primary, textAlign: "center" }}>
              {mode === "sign-up" ? "I already have an account" : "Create a new account"}
            </Text>
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}
`;
}
