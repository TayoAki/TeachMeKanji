// TEMPLATE FILE — owned by the platform, never written by the model.
// Push notifications sent by the app's owner (from the builder's Data tab) to people who opted
// in. Needs App Cloud and a store or development build: Expo Go can't receive them, so
// registerForPush() resolves false there and the app carries on.
import Constants from "expo-constants";
import { Platform } from "react-native";
import {
  getExpoPushTokenAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  setNotificationChannelAsync,
  AndroidImportance,
} from "expo-notifications";
import { backend } from "./backend";
import { api } from "./remote";

/** Ask for permission and register this phone for the owner's notifications. */
export async function registerForPush(): Promise<boolean> {
  if (!backend.apiUrl || Platform.OS === "web") return false;
  const projectId = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)
    ?.eas?.projectId;
  if (!projectId || Constants.executionEnvironment === "storeClient") return false;
  try {
    const current = await getPermissionsAsync();
    const granted = current.granted || (await requestPermissionsAsync()).granted;
    if (!granted) return false;
    if (Platform.OS === "android")
      await setNotificationChannelAsync("default", {
        name: "Updates",
        importance: AndroidImportance.DEFAULT,
      });
    const { data } = await getExpoPushTokenAsync({ projectId });
    await api("/push/register", {
      method: "POST",
      body: JSON.stringify({ token: data, platform: Platform.OS }),
    });
    return true;
  } catch {
    return false;
  }
}
