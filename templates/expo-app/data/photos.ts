// TEMPLATE FILE — owned by the platform, never written by the model.
// Pick a photo from the library or take one with the camera (system UI). Photos come back with
// base64, so a screen can pass them straight to askAI() or store them.
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
} from "expo-image-picker";

export interface Photo {
  uri: string;
  base64: string | null;
  width: number;
  height: number;
}

/** Resolves null when the person cancels (or declines camera access). */
export async function pickPhoto(
  options: { source?: "library" | "camera" } = {},
): Promise<Photo | null> {
  const settings = {
    mediaTypes: ["images" as const],
    quality: 0.6,
    base64: true,
    allowsEditing: true,
  };
  if (options.source === "camera") {
    const { granted } = await requestCameraPermissionsAsync();
    if (!granted) return null;
  }
  const result =
    options.source === "camera"
      ? await launchCameraAsync(settings)
      : await launchImageLibraryAsync(settings);
  const asset = result.canceled ? null : result.assets[0];
  if (!asset) return null;
  return {
    uri: asset.uri,
    base64: asset.base64 ?? null,
    width: asset.width,
    height: asset.height,
  };
}
