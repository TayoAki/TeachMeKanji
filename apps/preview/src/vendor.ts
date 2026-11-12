import * as React from "react";
import * as JSXRuntime from "react/jsx-runtime";
import * as ReactNative from "react-native";
import AsyncStorage from "./shims/async-storage";
import * as ExpoRouter from "./shims/expo-router";
import { Image } from "./shims/expo-image";
import { LinearGradient } from "./shims/linear-gradient";
import {
  captureRef,
  isAvailableAsync,
  notifications,
  shareAsync,
} from "./shims/native-capabilities";
import {
  CameraView,
  constants,
  imagePicker,
  location,
  purchasesSdk,
  useCameraPermissions,
} from "./shims/device-features";
import { SafeAreaProvider, SafeAreaView, useSafeAreaInsets } from "./shims/safe-area";
import { StatusBar } from "./shims/status-bar";
import { Ionicons } from "./shims/vector-icons";
import * as haptics from "./shims/haptics";
import * as svg from "./shims/svg";
import LottieView from "./shims/lottie";

function esm(namespace: object, defaultExport?: unknown): Record<string, unknown> {
  return { ...namespace, __esModule: true, default: defaultExport ?? namespace };
}

/**
 * Every module generated code may import (see IMPORTABLE_MODULES in @appbuilder/contract).
 * A test keeps the two lists in sync.
 */
export const vendorModules: Readonly<Record<string, unknown>> = {
  react: esm(React, React),
  "react/jsx-runtime": JSXRuntime,
  "react-native": esm(ReactNative),
  "expo-router": esm({
    Stack: ExpoRouter.Stack,
    Tabs: ExpoRouter.Tabs,
    Slot: ExpoRouter.Slot,
    Link: ExpoRouter.Link,
    Redirect: ExpoRouter.Redirect,
    router: ExpoRouter.router,
    useRouter: ExpoRouter.useRouter,
    useLocalSearchParams: ExpoRouter.useLocalSearchParams,
    useGlobalSearchParams: ExpoRouter.useGlobalSearchParams,
    usePathname: ExpoRouter.usePathname,
    useFocusEffect: ExpoRouter.useFocusEffect,
  }),
  "expo-status-bar": esm({ StatusBar }),
  "expo-image": esm({ Image }),
  "expo-linear-gradient": esm({ LinearGradient }),
  "@expo/vector-icons": esm({ Ionicons }),
  "react-native-safe-area-context": esm({ SafeAreaProvider, SafeAreaView, useSafeAreaInsets }),
  "@react-native-async-storage/async-storage": esm({}, AsyncStorage),
  "react-native-view-shot": esm({ captureRef }),
  "expo-sharing": esm({ isAvailableAsync, shareAsync }),
  "expo-notifications": esm(notifications),
  "expo-camera": esm({ CameraView, useCameraPermissions }),
  "expo-image-picker": esm(imagePicker),
  "expo-location": esm(location),
  "expo-constants": esm(constants, constants),
  "react-native-purchases": esm(purchasesSdk, purchasesSdk),
  "react-native-svg": esm(svg, svg.Svg),
  "expo-haptics": esm(haptics),
  "lottie-react-native": esm({ LottieView }, LottieView),
};
