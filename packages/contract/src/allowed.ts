/**
 * Modules generated code may import, and (where restricted) which named exports.
 * The preview runtime's vendor bundle ships exactly these modules, so anything outside
 * this list would fail to render in the preview as well as fail validation.
 *
 * `"*"` means any named export of that module is allowed.
 */
export const IMPORTABLE_MODULES: Readonly<Record<string, readonly string[] | "*">> = {
  react: "*",
  "react-native": "*",
  "expo-router": [
    "Stack",
    "Tabs",
    "Link",
    "router",
    "useRouter",
    "useLocalSearchParams",
    "usePathname",
    "useFocusEffect",
    "Redirect",
  ],
  "expo-status-bar": ["StatusBar"],
  "expo-image": ["Image"],
  "expo-linear-gradient": ["LinearGradient"],
  // v0: one icon family keeps the preview's font payload small and the model consistent.
  "@expo/vector-icons": ["Ionicons"],
  "react-native-safe-area-context": ["SafeAreaView", "useSafeAreaInsets", "SafeAreaProvider"],
  "@react-native-async-storage/async-storage": "*",
};

/**
 * Modules whose JSX elements render a native view that forwards `dataSet`, so the preview
 * can tag them with a source location for click-to-select. Custom components are not
 * tagged; selecting inside one resolves to the innermost tagged element in its own file.
 */
export const INSTRUMENTED_MODULES: ReadonlySet<string> = new Set([
  "react-native",
  "expo-image",
  "expo-linear-gradient",
  "@expo/vector-icons",
  "react-native-safe-area-context",
]);

/** AsyncStorage may only be used by the data layer, never directly by screens. */
export const DATA_LAYER_ONLY_MODULES: ReadonlySet<string> = new Set([
  "@react-native-async-storage/async-storage",
]);
