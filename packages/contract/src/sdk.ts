/**
 * The Expo SDK every generated app targets, and the exact dependency versions that go
 * with it (taken from `expo/bundledNativeModules.json` for this SDK). Upgrading the SDK
 * means changing this file, the template, the preview vendor bundle, and re-running evals.
 */
export const EXPO_SDK = {
  version: "58.0.0",
  dependencies: {
    expo: "~58.0.23",
    react: "19.3.0",
    "react-dom": "19.3.0",
    "react-native": "0.88.1",
    "react-native-web": "~0.21.4",
    "expo-router": "~58.0.30",
    "expo-status-bar": "~58.0.4",
    "expo-constants": "~58.0.15",
    "expo-linking": "~58.0.16",
    "expo-font": "~58.0.11",
    "expo-image": "~58.0.18",
    "expo-linear-gradient": "~58.0.3",
    "@expo/vector-icons": "^15.0.2",
    "react-native-safe-area-context": "~5.11.1",
    "react-native-screens": "~4.30.1",
    "@react-native-async-storage/async-storage": "2.2.0",
  },
} as const;
