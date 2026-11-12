/**
 * @hireshelby/react-native in the browser: the support chat is native iOS code, so here (as on
 * Android and in Expo Go) every call is safe and does nothing, and isSupported is false. Apps
 * fall back to emailing their support address (template components/support.tsx).
 */
const noop = () => {};
const resolved = async () => {};

export const HireShelby = {
  isSupported: false,
  version: "0.0.0",
  configure: noop,
  identify: noop,
  logout: noop,
  deleteData: resolved,
  setMetadata: noop,
  presentChat: noop,
  dismissChat: noop,
  isChatOpen: () => false,
  getUnreadCount: async () => 0,
  addUnreadCountListener: () => ({ remove: noop }),
  addEventListener: () => ({ remove: noop }),
  setPaywallHandler: noop,
  reportPaywalls: noop,
  setPushToken: noop,
  clearPushToken: noop,
  setPromotionalPushAllowed: noop,
  handleNotification: async () => false,
  shouldShowNotification: () => true,
  isHireShelbyNotification: () => false,
  reportStoreKit: noop,
  reportStoreKitEntitlements: resolved,
  track: noop,
  getAIReplies: async () => ({
    isEnabled: false,
    consent: null,
    processors: [],
    isAllowed: false,
    needsConsent: false,
  }),
  setAIRepliesAllowed: resolved,
};

export function useUnreadCount(): number {
  return 0;
}
