/**
 * The privacy policy App Builder hosts for each generated app (/apps/<projectId>/privacy):
 * what the app collects is read from its own files, so the policy follows the app as it
 * changes. Also fills the app's Privacy and Terms links (data/app-info.ts) when they're empty.
 */
import { APP_INFO_FILE } from "./app-structure";
import type { ProjectFiles } from "./layout";
import {
  readAnalyticsConfig,
  readPaymentsConfig,
  readPlatformConfig,
  readSupportChat,
} from "./platform-config";

/** Apple's standard licence agreement: subscription apps may link it as their Terms of Use. */
export const APPLE_STANDARD_EULA_URL =
  "https://www.apple.com/legal/internet-services/itunes/dev/stdeula/";

export function appPrivacyPath(projectId: string): string {
  return `/apps/${projectId}/privacy`;
}

export interface AppDataPractices {
  /** App Cloud: data saved on App Builder's servers instead of only on the device. */
  cloud: boolean;
  /** People can create an email account (and delete it in the app). */
  accounts: boolean;
  analytics: boolean;
  /** Questions (and photos) go to the AI provider to be answered. */
  ai: boolean;
  camera: boolean;
  photos: boolean;
  location: boolean;
  push: boolean;
  reminders: boolean;
  /** Real purchases through RevenueCat (keys set); otherwise purchases are simulated. */
  purchases: boolean;
  /** Hire Shelby's support chat is connected: support conversations are kept by Hire Shelby. */
  supportChat: boolean;
  /** From data/app-info.ts; "" when not set. */
  appName: string;
  supportEmail: string;
}

function appCode(files: ProjectFiles): string {
  return Object.entries(files)
    .filter(([path]) => /^(app|components)\//.test(path) && /\.tsx?$/.test(path))
    .map(([, source]) => source)
    .join("\n");
}

/** A string field of data/app-info.ts, whichever quoting the file uses. */
function appInfoField(files: ProjectFiles, name: string): string {
  const source = files[APP_INFO_FILE] ?? "";
  return new RegExp(`["']?${name}["']?\\s*:\\s*(["'])([^"'\\n]*)\\1`).exec(source)?.[2] ?? "";
}

export function readAppDataPractices(files: ProjectFiles): AppDataPractices {
  const code = appCode(files);
  const uses = (pattern: RegExp) => pattern.test(code);
  const payments = readPaymentsConfig(files);
  const cloud = readPlatformConfig(files).apiUrl !== "";
  return {
    cloud,
    accounts: cloud && uses(/\bsignUp\s*\(/),
    analytics: readAnalyticsConfig(files).url !== "",
    ai: uses(/from\s+["'][./]*data\/ai["']/),
    camera: uses(/\bCameraCapture\b/),
    photos: uses(/\bpickPhoto\s*\(/),
    location: uses(/\buseLocation\s*\(/),
    push: cloud && uses(/\bregisterForPush\s*\(/),
    reminders: uses(/\b(useReminder|setAlarms)\s*\(/),
    purchases: payments.iosApiKey !== "" || payments.androidApiKey !== "",
    supportChat: readSupportChat(files).appId !== "",
    appName: appInfoField(files, "name"),
    supportEmail: appInfoField(files, "supportEmail"),
  };
}

/** The app's Privacy link from data/app-info.ts ("" when not set). */
export function readAppPrivacyUrl(files: ProjectFiles): string {
  return appInfoField(files, "privacyUrl");
}

/**
 * Point the app's empty Privacy and Terms links at the hosted policy and Apple's standard
 * licence agreement. Links the owner (or the model) already filled in are never replaced.
 */
export function withLegalLinks(
  files: ProjectFiles,
  links: { privacyUrl: string; termsUrl: string },
): ProjectFiles {
  const source = files[APP_INFO_FILE];
  if (source === undefined) return files;
  let next = source;
  for (const [name, url] of Object.entries(links)) {
    next = next.replace(
      new RegExp(`(["']?${name}["']?\\s*:\\s*)(["'])\\2`),
      (_match, key: string) => `${key}${JSON.stringify(url)}`,
    );
  }
  return next === source ? files : { ...files, [APP_INFO_FILE]: next };
}

/** The links a project gets on the platform at `appUrl` (APP_PUBLIC_URL). */
export function legalLinksFor(appUrl: string, projectId: string) {
  return {
    privacyUrl: `${appUrl.replace(/\/$/, "")}${appPrivacyPath(projectId)}`,
    termsUrl: APPLE_STANDARD_EULA_URL,
  };
}
