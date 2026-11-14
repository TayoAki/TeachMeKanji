// TEMPLATE FILE — owned by the platform, never written by the model.
// How notifications behave in the app: ones that arrive while the app is open still show (an
// alarm also rings), and a notification that names a screen (data.href) opens it when tapped, or
// at once for an alarm that rings while the app is open. The root layout turns the links on.
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useEffect } from "react";

const isAlarm = (notification: Notifications.Notification) =>
  notification.request.content.data?.kind === "alarm";

Notifications.setNotificationHandler({
  handleNotification: async (notification) => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: isAlarm(notification),
    shouldSetBadge: false,
  }),
});

function open(notification: Notifications.Notification) {
  const href = notification.request.content.data?.href;
  if (typeof href === "string" && href.startsWith("/")) router.push(href as never);
}

/** Open the screens notifications name, once the app can show them (after onboarding). */
export function useNotificationLinks(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    // The app was opened by tapping one.
    const last = Notifications.getLastNotificationResponse();
    if (last && last.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER) {
      Notifications.clearLastNotificationResponse();
      open(last.notification);
    }
    const tapped = Notifications.addNotificationResponseReceivedListener((response) => {
      if (response.actionIdentifier === Notifications.DEFAULT_ACTION_IDENTIFIER)
        open(response.notification);
    });
    const received = Notifications.addNotificationReceivedListener((notification) => {
      if (isAlarm(notification)) open(notification);
    });
    return () => {
      tapped.remove();
      received.remove();
    };
  }, [enabled]);
}
