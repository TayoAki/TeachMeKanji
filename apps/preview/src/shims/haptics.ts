/** expo-haptics on web: there is nothing to vibrate, so every call resolves and does nothing. */
export const ImpactFeedbackStyle = {
  Light: "light",
  Medium: "medium",
  Heavy: "heavy",
  Soft: "soft",
  Rigid: "rigid",
} as const;

export const NotificationFeedbackType = {
  Success: "success",
  Warning: "warning",
  Error: "error",
} as const;

export async function impactAsync(_style?: string): Promise<void> {}
export async function notificationAsync(_type?: string): Promise<void> {}
export async function selectionAsync(): Promise<void> {}
