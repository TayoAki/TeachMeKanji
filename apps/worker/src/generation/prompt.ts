import {
  buildRouteTree,
  EXPO_SDK,
  hrefFor,
  IMPORTABLE_MODULES,
  screens,
  type ProjectFiles,
} from "@appbuilder/contract";

/**
 * The system prompt is built from the contract's own constants (allowed modules, SDK
 * version), so the rules the model is told and the rules the validator enforces cannot drift.
 * It is stable for a project, which makes it the cached prefix of every generation call.
 */
export function contractRules(): string {
  const modules = Object.entries(IMPORTABLE_MODULES)
    .map(
      ([name, allowed]) => `   - ${name}${allowed === "*" ? "" : ` (only: ${allowed.join(", ")})`}`,
    )
    .join("\n");
  const sdk = EXPO_SDK.version.split(".")[0];

  return `You write source files for a React Native app built with Expo SDK ${sdk} and Expo Router. The platform renders your code in a live preview, lets the user switch between theme packs instantly, and lets them click any element to edit it. That only works if every file follows these rules exactly.

Rules
1. Imports: only these modules, plus relative imports of files that exist in the project (listed below):
${modules}
   No other packages.
2. Colors: never write a color literal (hex, rgb()/hsl(), or a color name such as "white"). Take every color from \`const theme = useTheme()\` (from the project's theme/ThemeProvider). Use theme.spacing, theme.radius and theme.font for sizes and weights.
3. Data: read and write data only with \`useCollection<T>(name)\` from data/repo, which returns { items, loading, add, update, remove }. Use the collections and types that already exist in data/seed and data/schema. Never import AsyncStorage and never call fetch.
4. Screens (files under app/) must \`export default\` a function component. Content that can be taller than the screen must scroll (ScrollView). Tab screens pad the top with useSafeAreaInsets(); stack screens get a header and set its title with <Stack.Screen options={{ title: ... }} /> inside the component.
5. Icons: Ionicons from @expo/vector-icons, using valid Ionicons names. Cast a tab bar icon color with \`color as string\`.
6. Navigation: expo-router's Link (with asChild around a Pressable), router, and useLocalSearchParams. Routes come from file paths (listed below).
7. TypeScript with function components and hooks. Reuse the project's existing components where they fit.
8. theme/tokens.ts is the only file that may contain color literals; it defines exactly 5 theme packs, each setting every key of the Theme type in theme/types.ts.
9. Files you may write live under app/, components/, theme/ (tokens.ts only) and data/ (schema.ts and seed.ts only). Never write app/_layout.tsx, theme/types.ts, theme/ThemeProvider.tsx, theme/active.ts, data/repo.ts, data/local.ts, data/remote.ts, data/auth.ts, data/backend.ts or components/AiImage.tsx: the platform owns them.
10. Photos and illustrations: use <AiImage prompt="a short visual description" style={{ height: 180, borderRadius: theme.radius.md }} /> from components/AiImage. Never hard-code image URLs.
11. Accounts: only when data/backend.ts has a non-empty apiUrl (App Cloud enabled) may the app have sign-in and sign-up screens; build them with useAuth() from data/auth ({ user, signedIn, signIn, signUp, signOut, loading }). Data keeps working through useCollection either way.`;
}

export const SINGLE_FILE_OUTPUT =
  "Output: respond with only the complete contents of the requested file. No explanations and no markdown code fences.";

export const FILE_BLOCKS_OUTPUT = `Output format: write each file as
<file path="relative/path.tsx">
complete file contents
</file>
with no markdown fences inside or around the blocks.`;

/** Files the model always sees for context, in a fixed order (stable for caching). */
const CONTEXT_FILES = [
  "theme/types.ts",
  "theme/ThemeProvider.tsx",
  "data/repo.ts",
  "data/schema.ts",
  "data/seed.ts",
  "app/(tabs)/_layout.tsx",
];

export function projectContext(
  files: ProjectFiles,
  options: { exampleScreen?: string } = {},
): string {
  const paths = Object.keys(files).sort();
  const tree = buildRouteTree(paths);
  const routes = screens(tree)
    .map(({ screen }) => `   ${hrefFor(screen, {})}  ->  ${screen.file}`)
    .join("\n");

  const include = [
    ...CONTEXT_FILES,
    ...paths.filter((p) => p.startsWith("components/")),
    ...(options.exampleScreen ? [options.exampleScreen] : []),
  ].filter((p, i, all) => files[p] !== undefined && all.indexOf(p) === i);

  const sources = include.map((p) => `<file path="${p}">\n${files[p]}\n</file>`).join("\n\n");

  return `Project files:\n${paths.map((p) => `   ${p}`).join("\n")}\n\nRoutes:\n${routes}\n\nSource of the files you build on:\n\n${sources}`;
}

export interface FileSpec {
  path: string;
  purpose: string;
}

export function fileRequest(spec: FileSpec): string {
  return `Write the file \`${spec.path}\`.\n\nWhat it is for:\n${spec.purpose}`;
}

export function repairRequest(issueList: string): string {
  return `The file you wrote fails the platform's checks:\n\n${issueList}\n\nFix every issue and respond with the complete corrected file only.`;
}

/** Models sometimes wrap code in fences despite instructions; accept that. */
export function extractCode(text: string): string {
  const fenced = /^\s*```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/.exec(text);
  return (fenced ? fenced[1]! : text).trim() + "\n";
}
