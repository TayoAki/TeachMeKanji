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

export const fakeCreateMessage: CreateMessage = async (params, hooks) => {
  hooks?.onStreamStart?.();
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
  // Design-first steps: research (web search), direction, and the mockup reviewers.
  if (systemText(params).startsWith("You research mobile app ideas"))
    return JSON.stringify(fakeResearch());
  if (
    params.output_config?.format &&
    systemText(params).startsWith("You are the lead product designer")
  )
    return JSON.stringify(fakeDirection(request));
  if (params.output_config?.format && systemText(params).startsWith("You review app mockups"))
    return JSON.stringify({
      options: [1, 2].map((option) => ({
        option,
        planFit: 7,
        readability: 7,
        visualQuality: 7,
        distinctiveness: 7,
        nativeIOS: 7,
        buildable: 8,
        notes: "Offline review.",
      })),
      winner: 1,
      why: "Offline mode: the first option.",
    });
  if (params.output_config?.format && systemText(params).startsWith("You check app mockups"))
    return JSON.stringify({
      phoneFrame: false,
      multipleScreens: false,
      leakedText: [],
      problems: [],
    });
  // The match check: the offline build already matches its (offline) mockups.
  if (params.output_config?.format && systemText(params).startsWith("You compare an app screen"))
    return JSON.stringify({ score: 96, gaps: [], missingPictures: [] });
  // Store listing (structured output): fixed copy that fits the stores' limits.
  if (params.output_config?.format && systemText(params).startsWith("You write App Store"))
    return JSON.stringify(fakeListing(request));
  // Promo video storyboard (structured output): the first screens with fixed captions.
  if (params.output_config?.format && systemText(params).startsWith("You storyboard"))
    return JSON.stringify(fakeStoryboard(request));
  // RevenueCat setup through the connector: offline mode can't reach RevenueCat; fake keys.
  if (params.mcp_servers?.length && systemText(params).startsWith("You set up in-app purchases"))
    return `Offline mode: RevenueCat wasn't called.\n\n\`\`\`json\n${JSON.stringify({
      iosApiKey: "appl_OfflineTestKey1234",
      androidApiKey: "goog_OfflineTestKey1234",
      entitlement: "premium",
      summary: "Offline mode: pretend products, entitlement and offering.",
      storeSteps: ["Create the subscriptions in App Store Connect with the same product IDs."],
    })}\n\`\`\``;
  // AI inside a generated app (App Cloud /ai): a deterministic answer that echoes the question.
  if (systemText(params).startsWith("You are the AI inside"))
    return `Offline AI answer to: ${request.slice(0, 120)}`;
  // Reading connected tools (MCP connector): offline mode can't reach them; say so as a brief.
  if (params.mcp_servers?.length)
    return `Offline mode: ${params.mcp_servers.map((s) => s.name).join(", ")} wasn't called, so there is nothing to add.`;
  // The quality judge also asks for JSON; answer it with a neutral review.
  if (params.output_config?.format && systemText(params).includes("independent reviewer"))
    return JSON.stringify(fakeReview(request));
  if (params.output_config?.format) return JSON.stringify(fakePlan(request));
  // The shared layer arrives as two parallel requests: the theme, and everything else.
  if (request.includes("Write the theme of this app")) {
    const { "theme/tokens.ts": tokens } = sharedLayer(request);
    return formatFileBlocks({ "theme/tokens.ts": tokens! });
  }
  if (request.includes("Write the data and shared components of this app")) {
    const rest = sharedLayer(request);
    delete rest["theme/tokens.ts"];
    return formatFileBlocks(rest);
  }
  const screen = /Write the screen `([^`]+)` \("([^"]+)"/.exec(request);
  if (screen)
    return formatFileBlocks({
      [screen[1]!]: screenFile(screen[1]!, screen[2]!, systemText(params)),
    });
  if (request.includes("Change request:")) return fakeEdit(request, systemText(params));
  return "<summary>Nothing to change.</summary>";
}

/** A middling, evidence-free review (offline mode has no eyes): every criterion scores 2. */
function fakeReview(request: string) {
  const ids = /Score every criterion \(([^)]+)\)/.exec(request)?.[1]?.split(", ") ?? [];
  return {
    criteria: ids.map((id) => ({
      id,
      score: 2,
      evidence: "Offline review: scored without looking at the app.",
      fix: "Run the review with a real model for specific fixes.",
    })),
    issues: [],
    summary: "Offline review: connect an AI provider for a real one.",
  };
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
      role: "main",
    },
    {
      key: "insights",
      title: d.insightsTitle,
      kind: "tab",
      path: "app/(tabs)/insights.tsx",
      purpose: `Totals and a breakdown of your ${d.collection} by category.`,
      icon: "stats-chart-outline",
      role: "main",
    },
    {
      key: "detail",
      title: `${d.noun} details`,
      kind: "stack",
      path: `app/${d.singular}/[id].tsx`,
      purpose: `Shows one ${d.singular} and lets you delete it.`,
      icon: "document-text-outline",
      role: "main",
    },
    {
      key: "add",
      title: `New ${d.singular}`,
      kind: "stack",
      path: `app/add-${d.singular}.tsx`,
      purpose: `A form to add a ${d.singular}.`,
      icon: "add-circle-outline",
      role: "main",
    },
  ];
  const count = Number(
    /(\d+)\s+screens?/.exec(idea)?.[1] ?? (process.env.DEFAULT_SCREEN_COUNT || 3),
  );
  const structure: PlanScreen[] = [
    {
      key: "onboarding",
      title: "Welcome",
      kind: "stack",
      path: "app/onboarding.tsx",
      purpose: "Two quick steps: what you want to track, then into the app.",
      icon: "sparkles-outline",
      role: "onboarding",
    },
    {
      key: "paywall",
      title: "Premium",
      kind: "stack",
      path: "app/paywall.tsx",
      purpose: "What premium unlocks, the plans, restore and close.",
      icon: "star-outline",
      role: "paywall",
    },
  ];
  return {
    appName: d.appName,
    summary: `${d.appName} helps you keep track of your ${d.collection}, with quick entry and clear insights.`,
    audience: `People who want a calm, quick way to keep track of their ${d.collection}`,
    angle: `Built for logging in seconds, not managing a spreadsheet`,
    coreLoop: `Add a ${d.singular} in two taps and see the running total`,
    shareMoment: `A monthly summary card of your ${d.collection}`,
    onboarding: {
      steps: [
        {
          kind: "question",
          title: `What matters most?`,
          body: `We'll put it first on your home screen.`,
          options: ["Staying on budget", "Seeing trends", "Just logging"],
          answerKey: "focus",
        },
        {
          kind: "demo",
          title: `Add your first ${d.singular}`,
          body: `One tap from the home screen, any time.`,
          options: [],
          answerKey: "",
        },
      ],
    },
    monetization: {
      premiumFeatures: [`${d.insightsTitle} by category`, "Export to CSV"],
      offers: [
        {
          id: "yearly",
          label: "Yearly",
          price: "$19.99",
          period: "year",
          trialDays: 7,
          badge: "Save 44%",
        },
        {
          id: "monthly",
          label: "Monthly",
          price: "$2.99",
          period: "month",
          trialDays: 0,
          badge: "",
        },
      ],
    },
    screens: [
      ...structure,
      ...screens.slice(0, Math.max(2, Math.min(5, count))),
      {
        key: "settings",
        title: "Settings",
        kind: "stack",
        path: "app/settings.tsx",
        purpose: "Subscription, reminders, support and legal links.",
        icon: "settings-outline",
        role: "settings",
      },
    ],
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
    // Every plan already has its settings screen.
    if (!next.screens.some((s) => s.key === key || (key === "settings" && s.role === "settings")))
      next.screens.splice(next.screens.length - 1, 0, {
        key,
        title,
        kind: "tab",
        path: `app/(tabs)/${key}.tsx`,
        purpose: `${title}.`,
        icon: "sparkles-outline",
        role: "main",
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
    /Plan:\n([\s\S]*?)\n\nWrite the (?:theme|data and shared components) of this app/.exec(
      request,
    )![1]!,
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
  if (path === "app/onboarding.tsx") return onboardingScreen(root, collection);
  if (path === "app/paywall.tsx") return paywallScreen(root);
  if (path === "app/settings.tsx") return structureSettingsScreen(root);
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
import { Appear, CountUp } from "${root}components/motion";
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
          <CountUp value={total} style={{ color: theme.colors.onPrimary, fontSize: theme.font.size.display, fontWeight: theme.font.weight.bold }} />
          <Text style={{ color: theme.colors.onPrimary, fontSize: theme.font.size.body }}>
            {done} of {items.length} done
          </Text>
        </View>
        {items.map((item, index) => (
          <Appear key={item.id} delay={Math.min(index, 8) * 50}>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}>
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
          </Appear>
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

function onboardingScreen(root: string, collection: string) {
  return `import { Pressable, ScrollView, Text, View } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppState } from "${root}data/app-state";
import { useTheme } from "${root}theme/ThemeProvider";

const OPTIONS = ["Staying on budget", "Seeing trends", "Just logging"];

export default function OnboardingScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { answers, setAnswer, completeOnboarding } = useAppState();
  const [step, setStep] = useState(0);
  const chosen = answers.focus;
  const last = step === 1;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + theme.spacing.lg, paddingBottom: insets.bottom + theme.spacing.md, paddingHorizontal: theme.spacing.lg }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <Text style={{ color: theme.colors.textMuted }}>{step + 1} of 2</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Skip" hitSlop={12} onPress={() => completeOnboarding()}>
          <Text style={{ color: theme.colors.textMuted }}>Skip</Text>
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ paddingTop: theme.spacing.xl, gap: theme.spacing.md }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.font.size.display, fontWeight: theme.font.weight.bold }}>
          {last ? "Add your first one" : "What matters most?"}
        </Text>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.body }}>
          {last ? "One tap from the home screen, any time." : "We'll put it first on your home screen."}
        </Text>
        {last
          ? null
          : OPTIONS.map((option) => (
              <Pressable
                key={option}
                accessibilityRole="button"
                accessibilityState={{ selected: chosen === option }}
                onPress={() => setAnswer("focus", option)}
                style={({ pressed }) => ({ padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 1, borderColor: chosen === option ? theme.colors.primary : theme.colors.border, backgroundColor: pressed ? theme.colors.surfaceAlt : theme.colors.surface })}
              >
                <Text style={{ color: theme.colors.text, fontSize: theme.font.size.body }}>{option}</Text>
              </Pressable>
            ))}
      </ScrollView>
      <Pressable
        accessibilityRole="button"
        disabled={!last && !chosen}
        onPress={() => (last ? completeOnboarding() : setStep(1))}
        style={({ pressed }) => ({ opacity: !last && !chosen ? 0.5 : pressed ? 0.85 : 1, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, padding: theme.spacing.md, alignItems: "center" })}
      >
        <Text style={{ color: theme.colors.onPrimary, fontWeight: theme.font.weight.bold }}>{last ? "Start tracking ${collection}" : "Continue"}</Text>
      </Pressable>
    </View>
  );
}
`;
}

function paywallScreen(root: string) {
  return `import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { appInfo } from "${root}data/app-info";
import { usePurchases } from "${root}data/purchases";
import { useTheme } from "${root}theme/ThemeProvider";

export default function PaywallScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { offers, defaultOfferId, premiumFeatures, isPremium, status, error, testMode, purchase, restorePurchases, dismissPaywall } = usePurchases();
  const [selected, setSelected] = useState(defaultOfferId);
  const offer = offers.find((o) => o.id === selected) ?? offers[0];

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + theme.spacing.sm }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" hitSlop={12} onPress={dismissPaywall} style={{ alignSelf: "flex-end", padding: theme.spacing.md }}>
        <Ionicons name="close" size={24} color={theme.colors.textMuted as string} />
      </Pressable>
      <ScrollView contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingBottom: insets.bottom + theme.spacing.lg, gap: theme.spacing.md }}>
        <Text style={{ color: theme.colors.text, fontSize: theme.font.size.display, fontWeight: theme.font.weight.bold }}>See where it all goes</Text>
        {premiumFeatures.map((feature) => (
          <View key={feature} style={{ flexDirection: "row", gap: theme.spacing.sm, alignItems: "center" }}>
            <Ionicons name="checkmark-circle" size={20} color={theme.colors.success as string} />
            <Text style={{ color: theme.colors.text, fontSize: theme.font.size.body }}>{feature}</Text>
          </View>
        ))}
        {isPremium ? (
          <Text style={{ color: theme.colors.text, fontSize: theme.font.size.title }}>You're premium. Thank you!</Text>
        ) : (
          offers.map((o) => (
            <Pressable
              key={o.id}
              accessibilityRole="button"
              accessibilityState={{ selected: o.id === selected }}
              onPress={() => setSelected(o.id)}
              style={{ padding: theme.spacing.md, borderRadius: theme.radius.md, borderWidth: 2, borderColor: o.id === selected ? theme.colors.primary : theme.colors.border, backgroundColor: theme.colors.surface }}
            >
              <Text style={{ color: theme.colors.text, fontWeight: theme.font.weight.bold }}>{o.label}{o.badge ? " · " + o.badge : ""}</Text>
              <Text style={{ color: theme.colors.textMuted, fontVariant: ["tabular-nums"] }}>{o.price} / {o.period}{o.trialDays ? " · " + o.trialDays + "-day free trial" : ""}</Text>
            </Pressable>
          ))
        )}
        {isPremium || !offer ? null : (
          <Pressable
            accessibilityRole="button"
            disabled={status !== "idle"}
            onPress={async () => { if (await purchase(offer.id)) dismissPaywall(); }}
            style={({ pressed }) => ({ opacity: pressed || status !== "idle" ? 0.8 : 1, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, padding: theme.spacing.md, alignItems: "center" })}
          >
            <Text style={{ color: theme.colors.onPrimary, fontWeight: theme.font.weight.bold }}>{status === "purchasing" ? "Processing…" : offer.trialDays ? "Start free trial" : "Continue"}</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" onPress={() => restorePurchases()} style={{ alignItems: "center", padding: theme.spacing.sm }}>
          <Text style={{ color: theme.colors.textMuted }}>{status === "restoring" ? "Restoring…" : "Restore Purchases"}</Text>
        </Pressable>
        {error ? <Text style={{ color: theme.colors.danger, textAlign: "center" }}>{error}</Text> : null}
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.caption, textAlign: "center" }}>
          {offer ? "Renews automatically at " + offer.price + "/" + offer.period + " unless canceled at least 24 hours before the end of the period. Cancel anytime in your App Store or Google Play settings." : ""}
        </Text>
        <View style={{ flexDirection: "row", justifyContent: "center", gap: theme.spacing.md }}>
          {appInfo.termsUrl ? <Text onPress={() => Linking.openURL(appInfo.termsUrl)} style={{ color: theme.colors.textMuted, fontSize: theme.font.size.caption }}>Terms of Use</Text> : null}
          {appInfo.privacyUrl ? <Text onPress={() => Linking.openURL(appInfo.privacyUrl)} style={{ color: theme.colors.textMuted, fontSize: theme.font.size.caption }}>Privacy Policy</Text> : null}
        </View>
        {testMode ? <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.caption, textAlign: "center" }}>Test mode: purchases are simulated, nothing is charged.</Text> : null}
      </ScrollView>
    </View>
  );
}
`;
}

function structureSettingsScreen(root: string) {
  return `import { Linking, Platform, Pressable, ScrollView, Text, View } from "react-native";
import { Stack } from "expo-router";
import { appInfo } from "${root}data/app-info";
import { useAppState } from "${root}data/app-state";
import { usePurchases } from "${root}data/purchases";
import { useAppearance, useTheme } from "${root}theme/ThemeProvider";

const MANAGE_URL = Platform.OS === "ios" ? "https://apps.apple.com/account/subscriptions" : "https://play.google.com/store/account/subscriptions";

export default function SettingsScreen() {
  const theme = useTheme();
  const { isPremium, activeOffer, status, error, restorePurchases, openPaywall } = usePurchases();
  const { resetOnboarding } = useAppState();
  const [appearance, setAppearance] = useAppearance();
  const row = { paddingVertical: theme.spacing.md, borderBottomWidth: 1, borderBottomColor: theme.colors.border };
  const label = { color: theme.colors.text, fontSize: theme.font.size.body };
  const header = { color: theme.colors.textMuted, fontSize: theme.font.size.caption, marginTop: theme.spacing.lg };

  return (
    <ScrollView contentInsetAdjustmentBehavior="automatic" style={{ flex: 1, backgroundColor: theme.colors.background }} contentContainerStyle={{ padding: theme.spacing.md }}>
      <Stack.Screen options={{ title: "Settings" }} />
      <Text style={header}>SUBSCRIPTION</Text>
      <View style={row}>
        <Text style={label}>{isPremium ? "Premium · " + (activeOffer?.label ?? "") : "Free plan"}</Text>
      </View>
      {isPremium ? null : (
        <Pressable accessibilityRole="button" onPress={openPaywall} style={row}>
          <Text style={{ ...label, color: theme.colors.primary }}>Upgrade to Premium</Text>
        </Pressable>
      )}
      <Pressable accessibilityRole="button" onPress={() => restorePurchases()} style={row}>
        <Text style={label}>{status === "restoring" ? "Restoring…" : "Restore Purchases"}</Text>
      </Pressable>
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
      <Pressable accessibilityRole="button" onPress={() => Linking.openURL(MANAGE_URL)} style={row}>
        <Text style={label}>Manage subscription</Text>
      </Pressable>
      <Text style={header}>APPEARANCE</Text>
      <View style={{ ...row, flexDirection: "row", gap: theme.spacing.sm }}>
        {(["system", "light", "dark"] as const).map((option) => (
          <Pressable
            key={option}
            accessibilityRole="button"
            accessibilityState={{ selected: appearance === option }}
            onPress={() => setAppearance(option)}
            style={{ flex: 1, alignItems: "center", paddingVertical: theme.spacing.sm, borderRadius: theme.radius.md, borderWidth: 1, borderColor: appearance === option ? theme.colors.primary : theme.colors.border }}
          >
            <Text style={label}>{option === "system" ? "System" : option === "light" ? "Light" : "Dark"}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={header}>SUPPORT</Text>
      {appInfo.supportEmail ? (
        <Pressable accessibilityRole="button" onPress={() => Linking.openURL("mailto:" + appInfo.supportEmail)} style={row}>
          <Text style={label}>Contact support</Text>
        </Pressable>
      ) : null}
      {appInfo.privacyUrl ? (
        <Pressable accessibilityRole="button" onPress={() => Linking.openURL(appInfo.privacyUrl)} style={row}>
          <Text style={label}>Privacy Policy</Text>
        </Pressable>
      ) : null}
      {appInfo.termsUrl ? (
        <Pressable accessibilityRole="button" onPress={() => Linking.openURL(appInfo.termsUrl)} style={row}>
          <Text style={label}>Terms of Use</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" onPress={() => resetOnboarding()} style={row}>
        <Text style={label}>Replay onboarding</Text>
      </Pressable>
      <Text style={{ ...header, textAlign: "center" }}>{appInfo.name} · Version {appInfo.version}</Text>
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

  // "add an Ask AI tab": a screen that asks the app's AI (exercises useAI and App Cloud).
  if (/\bAI\b/.test(ask) && /\b(tab|screen)\b/i.test(ask)) {
    const layout = files["app/(tabs)/_layout.tsx"] ?? "";
    const entry = `      <Tabs.Screen
        name="ask"
        options={{
          title: "Ask AI",
          tabBarIcon: ({ color, size }) => <Ionicons name="sparkles-outline" color={color as string} size={size} />,
        }}
      />
    </Tabs>`;
    return `<summary>Added an Ask AI tab: type a question and the app's AI answers.</summary>\n${formatFileBlocks(
      {
        "app/(tabs)/ask.tsx": askAiScreen(),
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
    // A selected screen scopes the change to that screen.
    const scope = /The user selected the screen (\S+)/.exec(request)?.[1];
    const changed: Record<string, string> = {};
    for (const [path, content] of Object.entries(files)) {
      if (scope && path !== scope) continue;
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
  const [confirmDelete, setConfirmDelete] = useState(false);
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
          {confirmDelete ? (
            <View style={{ gap: theme.spacing.sm }}>
              <Text style={{ color: theme.colors.textMuted }}>This deletes your account and everything saved in it. It can't be undone.</Text>
              <Pressable accessibilityRole="button" onPress={() => void auth.deleteAccount().then(() => setConfirmDelete(false), (e: Error) => setError(e.message))} style={{ backgroundColor: theme.colors.danger, borderRadius: theme.radius.pill, padding: theme.spacing.md, alignItems: "center" }}>
                <Text style={{ color: theme.colors.onPrimary, fontWeight: theme.font.weight.bold }}>Delete my account</Text>
              </Pressable>
              <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(false)} style={{ padding: theme.spacing.sm, alignItems: "center" }}>
                <Text style={{ color: theme.colors.textMuted }}>Keep my account</Text>
              </Pressable>
            </View>
          ) : (
            <Pressable accessibilityRole="button" onPress={() => setConfirmDelete(true)} style={{ padding: theme.spacing.sm, alignItems: "center" }}>
              <Text style={{ color: theme.colors.danger }}>Delete account</Text>
            </Pressable>
          )}
          {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
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

function askAiScreen(): string {
  return `import { useState } from "react";
import { ActivityIndicator, Pressable, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAI } from "../../data/ai";
import { useTheme } from "../../theme/ThemeProvider";

export default function AskScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [question, setQuestion] = useState("");
  const { ask, answer, loading, error } = useAI();

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background, paddingTop: insets.top + theme.spacing.md, paddingHorizontal: theme.spacing.lg, gap: theme.spacing.md }}>
      <Text style={{ color: theme.colors.text, fontSize: theme.font.size.headline, fontWeight: theme.font.weight.bold }}>Ask AI</Text>
      <TextInput
        value={question}
        onChangeText={setQuestion}
        placeholder="What do you want to know?"
        placeholderTextColor={theme.colors.textMuted}
        accessibilityLabel="Question"
        style={{ color: theme.colors.text, backgroundColor: theme.colors.surface, borderRadius: theme.radius.md, padding: theme.spacing.md }}
      />
      <Pressable
        accessibilityRole="button"
        disabled={!question.trim() || loading}
        onPress={() => ask({ prompt: question, instructions: "Answer in two sentences." })}
        style={({ pressed }) => ({ opacity: pressed || loading ? 0.8 : 1, backgroundColor: theme.colors.primary, borderRadius: theme.radius.pill, padding: theme.spacing.md, alignItems: "center" })}
      >
        {loading ? <ActivityIndicator color={theme.colors.onPrimary} /> : <Text style={{ color: theme.colors.onPrimary, fontWeight: theme.font.weight.bold }}>Ask</Text>}
      </Pressable>
      {error ? <Text style={{ color: theme.colors.danger }}>{error}</Text> : null}
      {answer ? <Text style={{ color: theme.colors.text, fontSize: theme.font.size.body }}>{answer}</Text> : null}
    </View>
  );
}
`;
}

function fakeStoryboard(request: string) {
  const screens = (/these paths exactly\): ([^\n]+)/.exec(request)?.[1] ?? "")
    .split(", ")
    .filter(Boolean);
  const captions = ["Start in seconds", "See your progress", "Everything in one place"];
  return {
    hook: "Your day, sorted in a minute",
    beats: screens.slice(0, 3).map((screen, i) => ({
      screen,
      caption: captions[i]!,
      focus: i === 1 ? "middle" : "top",
    })),
    tagline: "Small steps, every day",
    cta: "Coming soon to iPhone",
  };
}

function fakeListing(request: string) {
  const name = /"appName": "([^"]+)"/.exec(request)?.[1] ?? "My App";
  const screens = (/use these paths exactly\): ([^\n]+)/.exec(request)?.[1] ?? "")
    .split(", ")
    .filter(Boolean);
  const captions = [
    "Start in seconds",
    "See your progress",
    "Everything in one place",
    "Made for you",
    "Go premium",
  ];
  return {
    name,
    subtitle: "Track it in seconds",
    promotionalText: `${name} keeps everything in one place, so you can see your progress every day.`,
    description: `${name} helps you keep track every day.\n\n• Add an entry in seconds\n• See your progress at a glance\n\nPremium unlocks more. The subscription renews automatically unless cancelled.`,
    keywords: "tracker,habits,progress,daily,goals",
    shortDescription: `Keep track every day with ${name}.`,
    category: "Productivity",
    screenshots: screens
      .slice(0, 5)
      .map((screen, i) => ({ screen, caption: captions[i] ?? "Made for you" })),
  };
}

/** Offline research: a fixed, clearly-labelled competitor so the planner gets the same shape. */
function fakeResearch() {
  return {
    competitors: [
      {
        name: "Offline Example App",
        whatPeopleLove: ["Quick to use every day"],
        complaints: ["Hides the basics behind a paywall"],
      },
    ],
    mustHaveFeatures: ["A daily habit people come back for"],
    differentiators: ["A generous free tier"],
    signatureInteractionIdeas: ["One satisfying gesture on the main screen"],
    brief:
      "Offline research (no web search ran): keep the core free and make the main screen satisfying to use.",
  };
}

/** Offline design direction: the plan's own screens and colors, with a mascot of three poses. */
function fakeDirection(request: string) {
  let plan: {
    appName?: string;
    themes?: Array<{ primary?: string }>;
    screens?: Array<{ path: string; title: string; purpose: string }>;
  } = {};
  const json = /PLAN:\n([\s\S]*?)\n\nRESEARCH:/.exec(request)?.[1];
  try {
    if (json) plan = JSON.parse(json);
  } catch {
    // keep the empty plan
  }
  const primary = plan.themes?.[0]?.primary ?? "#3B6EF5";
  return {
    styleName: "Offline Studio",
    summary: "A clean, friendly look drawn by the offline generator.",
    palette: {
      background: "#FFFFFF",
      surface: "#F4F5F8",
      text: "#14161B",
      mutedText: "#5E6470",
      primary,
      accent: primary,
      success: "#2E9E5B",
    },
    typography: { display: "System", body: "System", notes: "Bold titles, regular body." },
    shape: { cornerRadius: 16, cards: "Rounded cards", shadows: "Soft" },
    illustrationStyle: "Flat shapes",
    motion: {
      personality: "Calm",
      signatureInteraction: {
        name: "Tap to log",
        screen: plan.screens?.[0]?.path ?? "",
        description: "A tap fills the ring.",
        howItMoves: "Spring.",
      },
      perScreen: [],
    },
    mascot: {
      use: true,
      name: "Buddy",
      look: "A round friendly blob",
      personality: "Cheerful",
      poses: [
        { name: "neutral", description: "Standing and smiling" },
        { name: "happy", description: "Arms up, cheering" },
        { name: "sleepy", description: "Eyes half closed" },
      ],
    },
    screens: (plan.screens ?? []).map((s) => ({
      path: s.path,
      title: s.title,
      mockupBrief: s.purpose,
    })),
  };
}
