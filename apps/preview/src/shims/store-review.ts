/** expo-store-review on web: there is no App Store rating prompt, so it never shows. */
export async function isAvailableAsync(): Promise<boolean> {
  return false;
}
export async function hasAction(): Promise<boolean> {
  return false;
}
export async function requestReview(): Promise<void> {}
