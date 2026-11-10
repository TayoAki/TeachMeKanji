/**
 * Stand-ins for the camera, photo picker and location in the web preview. Apps reach them only
 * through the platform's helpers (components/camera, data/photos, data/location). The camera
 * shows a placeholder whose shutter "takes" a sample photo; the picker returns the same photo;
 * location is a fixed sample place. On a phone (Expo Go or a build) the real modules run.
 */
import { forwardRef, useImperativeHandle, useState } from "react";
import { Text, View, type ViewProps } from "react-native";

/** A small landscape PNG: real image data, so a preview can send it to askAI(). */
export const SAMPLE_PHOTO_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAGAAAABgCAIAAABt+uBvAAACrklEQVR4nO3QR1KiYRSF4buwM8aIEROY3UTnoGDOophQFEUx55zDBnoRdxE96oGTnvS1/o/R13WqnvE5Va982FIyyMctJYN82lYyyOdtJYN82VEyyNcdJYN821UyyPddJYP82FMyyM89JYN07ysZpGdfySDxAyWDJA70P/D7V/RfClyW3kP1nVHnTSHj0neo/no3zd/cLqT/SP0VKJDbhQwcqacC1Xnj8CKDx+ojhzpvgh7J0LH6yDlQ0CMZPlEfOQcKeiQjJ+oj50BBj2T0VH3kHCjokYydqo+cAwU9kvEz9ZFzoKBHMnGmPnIOFPRIJs/VR86Bgh7J1Ll6yqGOw4skL9Rfgeq4Xcj0hforUCC3C5m5VN+9m6aQcUld6n/AqFPgssxeKRlk7krJIPPXSgZZuFYyyOKNkkHSN0oGWbpVMsjyrZJBMndKBlm5UzLI6r2SQbL3SgZZe1AyyPqDkkFyj0oG2XhUMsjmk5JB8k9KBtl6VjLI9rOSQXZelAyy+6JkkL1XJYPsvyoZJNSNcAKRfsSG0DmKsgnUJNGUQvs8StKoyqAhi9YcivKoiKOuD82D6BpB+ThqpxCdQcccShdRvYzGVbSto3gTlT2o70XLAELDCI8hMonYNDpnUbaAmiU0raB9DSUbqOpGQwKt/SgaQsUo6ibQnERXCuXzqE0jmkFHFqU5VOfRGEdbH4oHUTmC+nG0TCE0g/AcIouILaNzFWXrqNlEUw/ae1EygKphNIyhdRJF06iYRd0CmpfQtYLyNdRuINqNjgRK+1E9hMZRtE2gOInKFOrn0ZJGKINwFpEcYnl0xlHWBwZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAZiIAbyLtAfZZE4jjmVIi0AAAAASUVORK5CYII=";
const SAMPLE_PHOTO = { uri: `data:image/png;base64,${SAMPLE_PHOTO_BASE64}`, width: 96, height: 96 };

// expo-camera
const granted = { granted: true, status: "granted", canAskAgain: true, expires: "never" };

export function useCameraPermissions() {
  const [permission, setPermission] = useState(granted);
  return [permission, async () => (setPermission(granted), granted)] as const;
}

export const CameraView = forwardRef<
  { takePictureAsync: (options?: { base64?: boolean }) => Promise<unknown> },
  ViewProps & { facing?: string }
>(function CameraView({ style, children }, ref) {
  useImperativeHandle(ref, () => ({
    takePictureAsync: async (options?: { base64?: boolean }) => ({
      ...SAMPLE_PHOTO,
      base64: options?.base64 ? SAMPLE_PHOTO_BASE64 : undefined,
    }),
  }));
  return (
    <View
      style={[
        { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#1f2937" },
        style,
      ]}
    >
      <Text style={{ color: "#e5e7eb", textAlign: "center", paddingHorizontal: 24 }}>
        The camera runs on your phone. Here the shutter takes a sample photo.
      </Text>
      {children}
    </View>
  );
});

// expo-image-picker
const picked = async () => ({
  canceled: false,
  assets: [{ ...SAMPLE_PHOTO, base64: SAMPLE_PHOTO_BASE64, type: "image" }],
});
export const imagePicker = {
  launchImageLibraryAsync: picked,
  launchCameraAsync: picked,
  requestCameraPermissionsAsync: async () => granted,
};

// expo-location
let locationStatus = "undetermined";
export const location = {
  Accuracy: { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 },
  getForegroundPermissionsAsync: async () => ({
    status: locationStatus,
    granted: locationStatus === "granted",
  }),
  requestForegroundPermissionsAsync: async () => {
    locationStatus = "granted";
    return { status: "granted", granted: true };
  },
  getCurrentPositionAsync: async () => ({
    coords: { latitude: 37.7599, longitude: -122.4148, accuracy: 30 },
    timestamp: Date.now(),
  }),
  reverseGeocodeAsync: async () => [
    {
      district: "Mission District",
      city: "San Francisco",
      region: "California",
      country: "United States",
    },
  ],
};

// expo-constants: the preview isn't a build, so there is no EAS project (no push).
export const constants = {
  expoConfig: { name: "Preview", extra: {} },
  executionEnvironment: "storeClient",
};
