// TEMPLATE FILE — owned by the platform, never written by the model.
// The support chat's client, typed for the platform's helpers (components/support and
// data/auth): Hire Shelby's SDK when data/support-chat.ts has it, else null.
import { supportChat } from "./support-chat";

interface SupportSdk {
  /** False in Expo Go, on Android and on the web: every call then does nothing. */
  readonly isSupported: boolean;
  configure(appId: string, options?: { theme?: Record<string, string> }): void;
  identify(user: { userId?: string; name?: string; email?: string }): void;
  logout(): void;
  deleteData(): Promise<void>;
  setMetadata(record: Record<string, string>): void;
  presentChat(): void;
  reportPaywalls(
    paywalls: Array<{
      id: string;
      title: string;
      source?: "revenuecat" | "superwall" | "adapty" | "app";
    }>,
  ): void;
  setPaywallHandler(handler: (paywallId: string) => void): void;
}

export interface SupportChatClient {
  appId: string;
  sdk: SupportSdk;
  useUnreadCount: () => number;
}

export const supportChatClient = supportChat as unknown as SupportChatClient | null;

/** After sign-in, sign-up or a restored session: who the person is (labels, never secrets). */
export function identifySupportUser(user: {
  id: string;
  email: string | null;
  name: string | null;
}): void {
  const chat = supportChatClient;
  if (!chat?.sdk.isSupported || !user.email) return;
  chat.sdk.identify({ userId: user.id, email: user.email, name: user.name ?? undefined });
}

/** A signed-in session ended. */
export function forgetSupportUser(): void {
  if (supportChatClient?.sdk.isSupported) supportChatClient.sdk.logout();
}

/** Account deletion removes the person's support conversation too (App Store 5.1.1(v)). */
export async function deleteSupportData(): Promise<void> {
  if (supportChatClient?.sdk.isSupported) await supportChatClient.sdk.deleteData();
}
