/**
 * The App Review check: what Apple and Google reject apps for, checked against the app's files
 * and its setup before it goes to the stores. Deterministic and instant. Each failed item says
 * which guideline it is, and those the AI can fix carry the chat request that fixes them.
 */
import { STRUCTURE_SCREENS, isStructureScreen } from "./app-structure";
import { isScreenFile, type ProjectFiles } from "./layout";
import {
  readPaymentsConfig,
  readPlatformConfig,
  readStoreSettings,
  readSupportChat,
} from "./platform-config";

export type ReviewStatus = "pass" | "warn" | "fail";

export interface ReviewItem {
  id: string;
  title: string;
  status: ReviewStatus;
  /** Why it matters, or what's wrong. */
  detail: string;
  /** App Store Review Guideline (or Google Play policy) it comes from. */
  guideline: string;
  /** A chat request the AI can act on to fix it (absent when the fix is a setting). */
  fix?: string;
}

export interface ReviewContext {
  platform: "ios" | "android";
  /** Errors reported from phones in the last two weeks that are still open. */
  openCrashes: number;
  openErrors: number;
  /** A store listing (name, description, keywords, screenshots) has been written. */
  hasListing: boolean;
}

export interface ReviewReport {
  /** No item fails: nothing here would get the app rejected. */
  ready: boolean;
  items: ReviewItem[];
}

/** Phone capabilities that make an app more than a website (App Store Guideline 4.2). */
const NATIVE =
  /\b(haptic|useReminder|setAlarms|registerForPush|CameraCapture|pickPhoto|useLocation|useShareImage|PanResponder|Celebrate)\b/;

export function reviewCheck(files: ProjectFiles, context: ReviewContext): ReviewReport {
  const items: ReviewItem[] = [];
  const add = (item: ReviewItem) => items.push(item);
  const pass = (ok: boolean, failStatus: ReviewStatus = "fail"): ReviewStatus =>
    ok ? "pass" : failStatus;

  const paywall = files[STRUCTURE_SCREENS.paywall];
  const settings = files[STRUCTURE_SCREENS.settings] ?? "";
  const screens = Object.keys(files).filter(isScreenFile);
  const mainScreens = screens.filter((p) => !isStructureScreen(p));
  const own = Object.entries(files).filter(
    ([p]) => p.startsWith("app/") || p.startsWith("components/"),
  );
  const ownSource = own.map(([, s]) => s).join("\n");
  const appInfo = files["data/app-info.ts"] ?? "";
  const infoField = (name: string) =>
    new RegExp(`${name}:\\s*"([^"]*)"`).exec(appInfo)?.[1]?.trim() ?? "";

  // Purchases (3.1.1 / 3.1.2): a paywall must sell real subscriptions, honestly described.
  if (paywall !== undefined) {
    const payments = readPaymentsConfig(files);
    const key = context.platform === "ios" ? payments.iosApiKey : payments.androidApiKey;
    add({
      id: "purchases-real",
      title: "Purchases are real, not simulated",
      status: pass(Boolean(key)),
      detail: key
        ? "RevenueCat is connected, so the paywall sells real subscriptions."
        : `The paywall still simulates purchases on ${context.platform === "ios" ? "iOS" : "Android"}. Connect RevenueCat in Payments (set it up for you or paste the keys), and test a purchase in TestFlight or internal testing with a sandbox account before submitting.`,
      guideline: "App Store 3.1.1 · Google Play Payments",
    });
    add({
      id: "paywall-close",
      title: "The paywall can be closed",
      status: pass(/\bdismissPaywall\b/.test(paywall)),
      detail: "A paywall without a way out is rejected.",
      guideline: "App Store 3.1.2 · 5.6",
      fix: "Give the paywall a clear close button that calls dismissPaywall().",
    });
    add({
      id: "restore",
      title: "Restore Purchases on the paywall and in Settings",
      status: pass(/\brestorePurchases\b/.test(paywall) && /\brestorePurchases\b/.test(settings)),
      detail: "Apple requires a way to restore purchases.",
      guideline: "App Store 3.1.1",
      fix: "Add a Restore Purchases button to the paywall and to Settings that calls restorePurchases().",
    });
    add({
      id: "renewal-terms",
      title: "Price, period, trial and auto-renewal stated",
      status: pass(/renew/i.test(paywall) && /\bperiod\b/.test(paywall)),
      detail:
        "Subscriptions must show the price, the billing period, any free trial and that they renew automatically.",
      guideline: "App Store 3.1.2",
      fix: "On the paywall, show each offer's price and billing period, its free-trial terms, and a line saying the subscription renews automatically until cancelled.",
    });
    add({
      id: "paywall-legal",
      title: "Terms and Privacy linked from the paywall",
      status: pass(/\b(termsUrl|privacyUrl)\b/.test(paywall)),
      detail: "Subscription apps need working Terms of Use and Privacy Policy links.",
      guideline: "App Store 3.1.2",
      fix: "Link Terms of Use and Privacy Policy on the paywall using appInfo.termsUrl and appInfo.privacyUrl.",
    });
  }

  // Accounts (5.1.1(v)): an app that creates accounts must let people delete them in the app.
  const accounts = Boolean(readPlatformConfig(files).apiUrl) && /\bsignUp\s*\(/.test(ownSource);
  if (accounts) {
    add({
      id: "delete-account",
      title: "Accounts can be deleted in the app",
      status: pass(/\bdeleteAccount\b/.test(ownSource)),
      detail: "Apps that let people create an account must let them delete it in the app.",
      guideline: "App Store 5.1.1(v)",
      fix: "Add a Delete account action for signed-in users in Settings that asks to confirm on the screen, then calls deleteAccount().",
    });
    add({
      id: "password-reset",
      title: "Forgot password",
      status: pass(/\brequestPasswordReset\b/.test(ownSource), "warn"),
      detail: "Without it, people locked out of their account can't get back in.",
      guideline: "Good practice",
      fix: 'Add "Forgot password?" to sign-in: requestPasswordReset(email) emails a code, then ask for the code and a new password and call resetPassword(email, code, newPassword).',
    });
  }

  // Privacy and support (5.1.1(i), 1.5).
  const privacyUrl = infoField("privacyUrl");
  add({
    id: "privacy-policy",
    title: "A privacy policy link",
    status: pass(Boolean(privacyUrl)),
    detail: privacyUrl
      ? "The app links its privacy policy; use the same link in App Store Connect and Play Console."
      : "The app has no privacy policy link. Ask the AI to rebuild Settings, or set appInfo.privacyUrl: every app needs one.",
    guideline: "App Store 5.1.1(i) · Google Play User Data",
  });
  const chat = Boolean(readSupportChat(files).appId);
  const email = Boolean(infoField("supportEmail"));
  add({
    id: "support",
    title: "A way to contact support",
    status: pass(chat || email, "warn"),
    detail: chat
      ? `Help & support opens the Hire Shelby chat on iOS${email ? " and emails support elsewhere" : "; add a support email for Android, where the chat doesn't run"}.`
      : email
        ? "Help & support emails your support address. Connect Hire Shelby for an in-app chat."
        : "Add a support email (data/app-info.ts) or connect Hire Shelby so people and App Review can reach you; the store listing also needs a support URL.",
    guideline: "App Store 1.5",
    fix: "Ask me for a support email and put it in data/app-info.ts as supportEmail, then offer it in Settings with <SupportButton />.",
  });

  // A complete app (2.1, 4.2).
  const placeholder = own
    .filter(([, s]) => /lorem ipsum|\bTODO\b|coming soon|could not be generated/i.test(s))
    .map(([p]) => p);
  add({
    id: "complete",
    title: "No placeholder or unfinished screens",
    status: pass(placeholder.length === 0),
    detail: placeholder.length
      ? `Placeholder or unfinished content in ${placeholder.join(", ")}.`
      : "Every screen has real content.",
    guideline: "App Store 2.1 · 2.3.3",
    fix: placeholder.length
      ? `Replace the placeholder or unfinished content in ${placeholder.join(", ")} with the real feature.`
      : undefined,
  });
  add({
    id: "enough-app",
    title: "Enough app to review",
    status: pass(mainScreens.length >= 2, "warn"),
    detail: `${mainScreens.length} main screen${mainScreens.length === 1 ? "" : "s"} besides onboarding, the paywall and settings. Very small apps are rejected as minimum functionality.`,
    guideline: "App Store 4.2",
  });
  add({
    id: "native",
    title: "Feels like a phone app, not a website",
    status: pass(NATIVE.test(ownSource), "warn"),
    detail: NATIVE.test(ownSource)
      ? "The app uses phone features (haptics, reminders, sharing, the camera or location)."
      : "Nothing in the app uses the phone: App Review rejects apps that feel like a repackaged website.",
    guideline: "App Store 4.2",
    fix: "Add a native touch that fits the app: haptic feedback on key actions, a daily reminder, or sharing a result as an image.",
  });

  // Stability (2.1): crashes on testers' phones get the app rejected.
  add({
    id: "crashes",
    title: "No open crashes from phones",
    status: context.openCrashes > 0 ? "fail" : context.openErrors > 0 ? "warn" : "pass",
    detail:
      context.openCrashes > 0
        ? `${context.openCrashes} crash${context.openCrashes === 1 ? "" : "es"} reported from phones in the last two weeks. Fix them in the Errors tab first.`
        : context.openErrors > 0
          ? `${context.openErrors} error${context.openErrors === 1 ? "" : "s"} reported from phones in the last two weeks. See the Errors tab.`
          : "No crashes or errors reported from phones.",
    guideline: "App Store 2.1",
    fix:
      context.openCrashes + context.openErrors > 0
        ? "Fix the errors people hit in the app."
        : undefined,
  });

  // Store setup.
  const ids = readStoreSettings(files);
  const id = context.platform === "ios" ? ids.ios : ids.android;
  add({
    id: "identifier",
    title: context.platform === "ios" ? "Bundle ID set" : "Package name set",
    status: pass(Boolean(id)),
    detail: id
      ? `${id}. Use the same one in ${context.platform === "ios" ? "App Store Connect" : "Play Console"}.`
      : "Set it under Send to the stores.",
    guideline: "Store setup",
  });
  add({
    id: "listing",
    title: "Store listing written",
    status: pass(context.hasListing, "warn"),
    detail: context.hasListing
      ? "Name, description, keywords and framed screenshots are ready in Store listing."
      : "Write the store listing (name, description, keywords, screenshots) before you submit.",
    guideline: "App Store 2.3",
  });

  return { ready: items.every((i) => i.status !== "fail"), items };
}
