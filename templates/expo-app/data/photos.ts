// TEMPLATE FILE — owned by the platform, never written by the model.
// Pick a photo from the library or take one with the camera (system UI). Photos come back with
// base64, so a screen can pass them straight to askAI(); keepPhoto() keeps one for good.
import { Directory, File, Paths } from "expo-file-system";
import {
  launchCameraAsync,
  launchImageLibraryAsync,
  requestCameraPermissionsAsync,
} from "expo-image-picker";
import { Platform } from "react-native";

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

const KEPT_FOLDER = "photos";

/**
 * Keep a photo for good. Picked and camera photos live in a cache the phone may clear, so a
 * record that stores photo.uri can lose its picture later: store the uri keepPhoto() returns
 * instead, and show it with photoUri(). Resolves the photo with its kept uri.
 */
export async function keepPhoto(photo: Photo): Promise<Photo> {
  if (Platform.OS === "web") return photo;
  const folder = new Directory(Paths.document, KEPT_FOLDER);
  if (!folder.exists) folder.create({ intermediates: true, idempotent: true });
  const extension = /\.(jpe?g|png|heic|webp)(?:\?|$)/i.exec(photo.uri)?.[1] ?? "jpg";
  const name = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}.${extension}`;
  const kept = new File(folder, name);
  await new File(photo.uri).copy(kept);
  return { ...photo, uri: kept.uri };
}

/** A kept photo's uri relative to the documents folder, or null for any other uri. */
export function keptName(uri: string): string | null {
  const match = new RegExp(`/${KEPT_FOLDER}/([^/?#]+)$`).exec(uri);
  return uri.startsWith("file:") && match ? match[1]! : null;
}

/**
 * The uri to show a stored photo with: <Image source={{ uri: photoUri(item.photoUri) }} />. The
 * app's documents folder moves when the app is updated, so a kept photo is found by its name.
 */
export function photoUri(uri: string): string {
  if (Platform.OS === "web") return uri;
  const name = keptName(uri);
  return name ? new File(Paths.document, KEPT_FOLDER, name).uri : uri;
}

/** Delete a kept photo (when its record is deleted). Other uris are left alone. */
export function forgetPhoto(uri: string): void {
  if (Platform.OS === "web") return;
  const name = keptName(uri);
  if (!name) return;
  try {
    const file = new File(Paths.document, KEPT_FOLDER, name);
    if (file.exists) file.delete();
  } catch {
    // Already gone.
  }
}
