// TEMPLATE FILE — owned by the platform, never written by the model.
// Help & support. When the owner connects Hire Shelby (data/support-chat.ts, written by the
// platform), it opens Hire Shelby's native support chat in store and TestFlight builds on iOS,
// with an unread badge; the team answers from the Hire Shelby dashboard, Telegram or its AI.
// Everywhere else (the preview, Expo Go, Android, or not connected) it emails the support
// address in data/app-info.ts.
import { useEffect } from "react";
import { Linking, Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { appInfo } from "../data/app-info";
import { monetization } from "../data/monetization";
import { openPaywall, usePurchases } from "../data/purchases";
import { supportChatClient } from "../data/support";
import { useTheme } from "../theme/ThemeProvider";

const chat = supportChatClient;
// Chosen once, so the hook below is the same function on every render.
const useChatUnread: () => number = chat ? chat.useUnreadCount : () => 0;

/** The native chat can open here (connected, on an iOS store or TestFlight build). */
function chatReady(): boolean {
  return Boolean(chat?.sdk.isSupported);
}

function emailSupport(): void {
  if (!appInfo.supportEmail) return;
  const subject = encodeURIComponent(`${appInfo.name} support`);
  void Linking.openURL(`mailto:${appInfo.supportEmail}?subject=${subject}`);
}

/**
 * Help & support for the app's own screens: `open()` shows the support chat (or writes an email),
 * `unread` counts the team's replies not yet seen, and `available` is false when there is no way
 * to reach support yet (no chat and no support email), so the entry can be hidden.
 */
export function useSupport(): {
  open: () => void;
  unread: number;
  available: boolean;
  chat: boolean;
} {
  const unread = useChatUnread();
  const ready = chatReady();
  return {
    open: () => (ready ? chat!.sdk.presentChat() : emailSupport()),
    unread: ready ? unread : 0,
    available: ready || Boolean(appInfo.supportEmail),
    chat: ready,
  };
}

/** A "Help & support" row for Settings, with the unread badge. Hidden when support can't be reached. */
export function SupportButton({
  label = "Help & support",
  style,
}: {
  label?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const { open, unread, available } = useSupport();
  if (!available) return null;
  return (
    <Pressable
      onPress={open}
      accessibilityRole="button"
      accessibilityLabel={unread ? `${label}, ${unread} unread` : label}
      style={({ pressed }) => [
        {
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingVertical: theme.spacing.md,
          opacity: pressed ? 0.7 : 1,
        },
        style,
      ]}
    >
      <Text style={{ color: theme.colors.text, fontSize: theme.font.size.body }}>{label}</Text>
      {unread > 0 ? (
        <View
          style={{
            minWidth: 22,
            height: 22,
            borderRadius: 11,
            paddingHorizontal: 6,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: theme.colors.primary,
          }}
        >
          <Text
            style={{
              color: theme.colors.onPrimary,
              fontSize: theme.font.size.caption,
              fontWeight: theme.font.weight.bold,
              fontVariant: ["tabular-nums"],
            }}
          >
            {unread > 99 ? "99+" : unread}
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}

/**
 * Called once by the root layout: sets the chat up in the app's own colors, tells the team which
 * paywalls exist (they can send offers for them), opens the paywall when someone taps one, and
 * shows the team whether the person is premium.
 */
export function useSupportSetup(): void {
  const theme = useTheme();
  const { isPremium } = usePurchases();
  useEffect(() => {
    if (!chat?.sdk.isSupported) return;
    chat.sdk.configure(chat.appId, {
      theme: {
        accentColor: theme.colors.primary,
        onAccentColor: theme.colors.onPrimary,
        backgroundColor: theme.colors.background,
        incomingBubbleColor: theme.colors.surfaceAlt,
        incomingTextColor: theme.colors.text,
        title: "Support",
      },
    });
    chat.sdk.reportPaywalls(
      monetization.offers.map((offer) => ({
        id: offer.id.replace(/[^A-Za-z0-9_.-]/g, "-").slice(0, 64) || "premium",
        title: `${offer.label} ${offer.price}`.slice(0, 60),
        source: "app",
      })),
    );
    chat.sdk.setPaywallHandler(() => openPaywall());
  }, [theme]);
  useEffect(() => {
    if (chat?.sdk.isSupported) chat.sdk.setMetadata({ plan: isPremium ? "premium" : "free" });
  }, [isPremium]);
}
