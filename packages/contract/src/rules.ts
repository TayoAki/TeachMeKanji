import { EXPO_SDK } from "./sdk";
import { IMPORTABLE_MODULES } from "./allowed";
import type { ProjectFiles } from "./layout";
import { buildRouteTree, hrefFor, screens } from "./routes";

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
9. Files you may write live under app/, components/, theme/ (tokens.ts only) and data/ (schema.ts, seed.ts, monetization.ts and app-info.ts only). Never write app/_layout.tsx, theme/types.ts, theme/ThemeProvider.tsx, theme/active.ts, data/repo.ts, data/local.ts, data/remote.ts, data/auth.ts, data/backend.ts, data/images.ts, data/app-state.ts, data/purchases.ts, data/app-structure.ts or components/AiImage.tsx: the platform owns them.
10. Photos and illustrations: use AiImage from components/AiImage. <AiImage name="hero" style={{ height: 180, borderRadius: theme.radius.md }} /> shows an image added to the project (the names are the keys in data/images.ts); <AiImage prompt="a short visual description" style={...} /> generates one. Never hard-code image URLs.
11. Accounts: only when data/backend.ts has a non-empty apiUrl (App Cloud enabled) may the app have sign-in and sign-up screens; build them with useAuth() from data/auth ({ user, signedIn, signIn, signUp, signOut, loading }). Data keeps working through useCollection either way. With accounts, Settings offers sign out and account deletion.
12. Every app has four parts. app/onboarding.tsx (first launch), app/paywall.tsx (opened as a modal) and app/settings.tsx are its structure screens; the root layout (platform-owned) shows onboarding until it is completed. Use the platform's hooks:
   - useAppState() from data/app-state: { answers, setAnswer(key, value), completeOnboarding(), resetOnboarding() }. Onboarding's last action calls completeOnboarding(), which navigates by itself. The main app may read answers to personalize what it shows.
   - usePurchases() from data/purchases: { isPremium, offers, defaultOfferId, premiumFeatures, activeOffer, status ("idle" | "purchasing" | "restoring"), error, testMode, purchase(offerId), restorePurchases(), openPaywall(), dismissPaywall() }. Premium features in the main app check isPremium and call openPaywall() when locked; nothing else unlocks them.
   - appInfo from data/app-info: { name, version, supportEmail, privacyUrl, termsUrl } for support and legal links (Linking.openURL; hide a link whose value is empty).
13. Feel native: Pressable with a pressed state (never TouchableOpacity); no Alert.alert to confirm success (show it in the UI); no custom <Modal> (use a route); every icon-only control has accessibilityRole="button" and an accessibilityLabel; touch targets at least 44pt (use hitSlop); never disable font scaling; FlatList for lists of records; fontVariant ["tabular-nums"] on numbers that change.
14. States: a screen that reads data shows a loading state while useCollection is loading, an empty state with a next action when there is nothing yet, and the content otherwise (never the empty state while loading). Every control does what its label says.
15. No placeholder or generic copy (no lorem ipsum, "Coming soon", "TODO", "Welcome to <App>"), no emoji as icons, no gradient hero banners: write specific copy for the app's audience.`;
}

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
