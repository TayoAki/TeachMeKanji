import type { AppPlan, PlanScreen, ProjectFiles } from "@appbuilder/contract";
import { contractRules, FILE_BLOCKS_OUTPUT } from "../generation/prompt";

export function planSystem(defaultScreens: number, maxScreens: number): string {
  return `You are the product planner of an AI mobile app builder. From the user's idea (and any reference images), propose a focused first version of a mobile app built with Expo Router and React Native.

Rules for the plan:
- ${defaultScreens} screens by default, or the number the user asks for, never more than ${maxScreens}.
- 2 to 5 tab screens. The first tab is the home screen and its path is exactly app/(tabs)/index.tsx. Other tabs live at app/(tabs)/<key>.tsx.
- Screens opened from a tab (detail, add/edit forms, settings) are "stack" screens at app/<key>.tsx. A detail screen for one record uses a route parameter: app/<collection-singular>/[id].tsx.
- Every screen must be useful with local data. Define 1–3 collections (snake_case names, plural) with realistic fields; "id" is implicit, don't list it.
- Give every screen a concise purpose that says what it shows and what the user can do there, and an Ionicons icon name.
- Propose exactly 5 distinct visual themes (at least 2 dark), each with a short id, a name, a one-line mood and a primary color as #RRGGBB.
- appName: short and brandable. summary: one or two sentences.
If the user gives feedback on a previous plan, return the full revised plan that applies it and keeps everything else.`;
}

export function planRequest(input: {
  prompt: string;
  platforms: string;
  previous?: AppPlan;
  feedback?: string;
}): string {
  const parts = [`App idea: ${input.prompt}`, `Target platforms: ${input.platforms}`];
  if (input.previous) {
    parts.push(`Current plan:\n${JSON.stringify(input.previous, null, 2)}`);
    parts.push(`Requested changes: ${input.feedback ?? ""}`);
  }
  return parts.join("\n\n");
}

/** System prompt for build/edit calls: rules, output format, then the project (cached). */
export function codeSystem(
  contextLabel: string,
  context: string,
  output: string = FILE_BLOCKS_OUTPUT,
) {
  return [
    { type: "text" as const, text: `${contractRules()}\n\n${output}` },
    {
      type: "text" as const,
      text: `${contextLabel}\n\n${context}`,
      cache_control: { type: "ephemeral" as const },
    },
  ];
}

export function filesAsContext(files: ProjectFiles, paths?: string[]): string {
  const list = (paths ?? Object.keys(files)).filter((p) => files[p] !== undefined).sort();
  return list.map((p) => `<file path="${p}">\n${files[p]}\n</file>`).join("\n\n");
}

export function sharedLayerRequest(plan: AppPlan): string {
  const tabs = plan.screens.filter((s) => s.kind === "tab");
  const themes = plan.themes
    .map(
      (t, i) =>
        `   ${i + 1}. id "${t.id}", name "${t.name}", ${t.dark ? "dark" : "light"}, mood: ${t.mood}, primary ${t.primary}`,
    )
    .join("\n");
  return `Plan:
${JSON.stringify(plan, null, 2)}

Write the shared layer of this app:
- theme/tokens.ts: \`import type { Theme } from "./types";\` then \`export const themes: Theme[]\` with exactly these 5 packs, in this order, each setting every key of Theme (colors, radius, spacing, font):
${themes}
  and \`export const defaultThemeId = "${plan.themes[0]?.id}";\`. Make text readable on every surface (good contrast for text, textMuted and onPrimary).
- data/schema.ts: an exported TypeScript interface per collection (each with \`id: string\`), plus small pure helpers the screens will need (formatting, date helpers).
- data/seed.ts: \`export const seed = { ... }\` with one key per collection (${plan.collections.map((c) => c.name).join(", ")}) and 5–8 realistic records each, using ids like "${plan.collections[0]?.name.slice(0, 1) ?? "r"}1". Dates as ISO strings relative to today.
- app/(tabs)/_layout.tsx: a Tabs navigator with headerShown false, colors from the theme, and one <Tabs.Screen> per tab in this order: ${tabs.map((t) => `"${t.path.replace("app/(tabs)/", "").replace(".tsx", "")}" (${t.title}, icon ${t.icon})`).join(", ")}.
- components/: 1–3 small shared components the screens will reuse (cards, list rows, empty states, buttons).`;
}

export function screenRequest(plan: AppPlan, screen: PlanScreen, written: ProjectFiles): string {
  const others = plan.screens
    .filter((s) => s.key !== screen.key)
    .map((s) => `   - ${s.title} (${s.kind}) at ${s.path}: ${s.purpose}`)
    .join("\n");
  const done = Object.keys(written).filter(
    (p) => p.startsWith("app/") && !p.endsWith("_layout.tsx"),
  );
  return `App: ${plan.appName} — ${plan.summary}

Write the screen \`${screen.path}\` ("${screen.title}", ${screen.kind} screen).
What it is for: ${screen.purpose}

Other screens in the app (link to them by their routes when it helps the user):
${others || "   (none)"}
${done.length ? `\nAlready written: ${done.join(", ")}.` : ""}
Write exactly one <file> block for ${screen.path}. You may add one more <file> block for a new component in components/ if this screen needs it. Make it look polished: clear hierarchy, generous spacing, cards, and empty states.`;
}

export function editRequest(input: {
  request: string;
  selection?: { path: string; snippet: string } | null;
  history?: string[];
  maxScreens: number;
}): string {
  const parts: string[] = [];
  if (input.history?.length)
    parts.push(`Recent conversation:\n${input.history.map((h) => `- ${h}`).join("\n")}`);
  parts.push(`Change request: ${input.request}`);
  if (input.selection) {
    parts.push(
      `The user selected this element in ${input.selection.path}:\n${input.selection.snippet}`,
    );
  }
  parts.push(`Make the smallest set of changes that fully does what was asked. Start with
<summary>one or two sentences telling the user what you changed</summary>
then a <file> block with the complete new contents of every file you create or change, and <delete path="..." /> for any file to remove. To add a tab, create its screen under app/(tabs)/ and add it to app/(tabs)/_layout.tsx. The app may have at most ${input.maxScreens} screens. If the message is a question or needs no code change, reply with only the summary.`);
  return parts.join("\n\n");
}

/** A screen that always passes validation, used when generating a screen fails. */
export function fallbackScreen(title: string, path: string): string {
  return `import { Text, View } from "react-native";
import { useTheme } from "${rootPrefix(path)}theme/ThemeProvider";

export default function FallbackScreen() {
  const theme = useTheme();
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: theme.spacing.lg, backgroundColor: theme.colors.background }}>
      <Text style={{ color: theme.colors.text, fontSize: theme.font.size.title, fontWeight: theme.font.weight.bold }}>${JSON.stringify(title).slice(1, -1)}</Text>
      <Text style={{ color: theme.colors.textMuted, marginTop: theme.spacing.sm, textAlign: "center" }}>
        This screen could not be generated. Ask the agent to try again.
      </Text>
    </View>
  );
}
`;
}

/** Relative import prefix from a file to the project root ("../" per directory level). */
export function rootPrefix(path: string): string {
  const depth = path.split("/").length - 1;
  return depth === 0 ? "./" : "../".repeat(depth);
}
