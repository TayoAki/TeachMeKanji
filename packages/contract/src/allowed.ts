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
  // Native capabilities used only through the platform's helpers (see PLATFORM_ONLY_MODULES).
  "react-native-view-shot": ["captureRef"],
  "expo-sharing": ["isAvailableAsync", "shareAsync"],
  "expo-notifications": "*",
  "expo-camera": ["CameraView", "useCameraPermissions"],
  "expo-image-picker": [
    "launchCameraAsync",
    "launchImageLibraryAsync",
    "requestCameraPermissionsAsync",
  ],
  "expo-location": [
    "Accuracy",
    "getCurrentPositionAsync",
    "getForegroundPermissionsAsync",
    "requestForegroundPermissionsAsync",
    "reverseGeocodeAsync",
  ],
  "expo-constants": "*",
  "react-native-purchases": "*",
  // Drawing: rings, ribbons, curves and charts (colors still come from the theme).
  "react-native-svg": [
    "default",
    "Svg",
    "Circle",
    "Ellipse",
    "G",
    "Line",
    "Path",
    "Polygon",
    "Polyline",
    "Rect",
    "Defs",
    "LinearGradient",
    "RadialGradient",
    "Stop",
    "ClipPath",
    "Text",
    "TSpan",
  ],
  // Used through haptic() from components/motion (see PLATFORM_ONLY_MODULES).
  "expo-haptics": [
    "impactAsync",
    "notificationAsync",
    "selectionAsync",
    "ImpactFeedbackStyle",
    "NotificationFeedbackType",
  ],
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

/**
 * Native modules only the platform's own files import; generated code uses the helpers:
 * useShareImage() (components/share), useReminder() (data/reminders), <CameraCapture>
 * (components/camera), pickPhoto() (data/photos), useLocation() (data/location) and
 * registerForPush() (data/push).
 */
export const PLATFORM_ONLY_MODULES: Readonly<Record<string, string>> = {
  "react-native-view-shot": "Share a card as an image with useShareImage() from components/share.",
  "expo-sharing": "Share a card as an image with useShareImage() from components/share.",
  "expo-notifications":
    "Schedule the daily reminder with useReminder() from data/reminders; register for the owner's notifications with registerForPush() from data/push.",
  "expo-camera": "Show the camera with <CameraCapture> from components/camera.",
  "expo-image-picker": "Pick or take a photo with pickPhoto() from data/photos.",
  "expo-location": "Get the person's location with useLocation() from data/location.",
  "expo-constants": "The platform's helpers read the app's configuration.",
  "react-native-purchases": "Sell premium with usePurchases() from data/purchases.",
  "expo-haptics":
    'Give haptic feedback with haptic("selection" | "light" | "success" | "warning") from components/motion.',
};

/** AsyncStorage may only be used by the data layer, never directly by screens. */
export const DATA_LAYER_ONLY_MODULES: ReadonlySet<string> = new Set([
  "@react-native-async-storage/async-storage",
]);
