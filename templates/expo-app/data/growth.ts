// TEMPLATE FILE — owned by the platform, never written by the model.
// Growth: inviting friends with a link to the app's own page (it shows "Coming soon", then the
// App Store or pre-order button once the app is listed), and Apple's own rating prompt after a
// few wins. Apple only allows its own prompt (App Review 5.6.1), so never ask for ratings with a
// custom screen. In the web preview, sharing shows what would be sent.
import AsyncStorage from "@react-native-async-storage/async-storage";
import { hasAction, requestReview } from "expo-store-review";
import { Share } from "react-native";
import { appInfo } from "./app-info";
import { errorsConfig } from "./errors-config";

const WINS_KEY = "app:growth:wins";
const ASKED_KEY = "app:growth:review-asked";
const WINS_BEFORE_ASKING = 3;
const DAYS_BETWEEN_ASKS = 120;

/** The app's page on the web ("" before the platform has set the app up). */
export function inviteUrl(): string {
  return errorsConfig.url && errorsConfig.projectId
    ? `${errorsConfig.url}/apps/${errorsConfig.projectId}`
    : "";
}

/**
 * Invite friends: the share sheet with a message and the app's link. Resolves false when the
 * person closes it without sharing.
 */
export async function inviteFriends(message?: string): Promise<boolean> {
  const text = [message || `I'm using ${appInfo.name}. Come try it with me:`, inviteUrl()]
    .filter(Boolean)
    .join(" ");
  try {
    const result = await Share.share({ message: text, title: appInfo.name });
    return result?.action !== Share.dismissedAction;
  } catch {
    return false;
  }
}

/**
 * Count one success of the app's core loop (a finished workout, a streak day, a solved puzzle).
 * After the third, Apple's rating prompt may appear: Apple decides whether to show it, and the
 * app asks at most once every four months.
 */
export async function noteWin(): Promise<void> {
  try {
    const wins = Number((await AsyncStorage.getItem(WINS_KEY)) || 0) + 1;
    await AsyncStorage.setItem(WINS_KEY, String(wins));
    if (wins < WINS_BEFORE_ASKING) return;
    const asked = Number((await AsyncStorage.getItem(ASKED_KEY)) || 0);
    if (Date.now() - asked < DAYS_BETWEEN_ASKS * 86_400_000) return;
    if (!(await hasAction())) return;
    await AsyncStorage.setItem(ASKED_KEY, String(Date.now()));
    await requestReview();
  } catch {
    // Never let the rating prompt get in the way of the app.
  }
}
