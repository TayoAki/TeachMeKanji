// TEMPLATE FILE — owned by the platform, never written by the model.
// A full-screen camera with a shutter button, and optional barcode/QR scanning. It asks for
// camera permission itself and says how to allow it later if the person declined.
import { useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import type { Photo } from "../data/photos";
import { useTheme } from "../theme/ThemeProvider";

export function CameraCapture({
  onCapture,
  onCancel,
  onBarcode,
  facing = "back",
  hint,
}: {
  /** A photo was taken (base64 included, ready for askAI). */
  onCapture?: (photo: Photo) => void;
  onCancel?: () => void;
  /** Scan barcodes and QR codes instead of (or as well as) taking photos. */
  onBarcode?: (data: string) => void;
  facing?: "back" | "front";
  /** A line of guidance over the camera, e.g. "Fit the whole plant in the frame". */
  hint?: string;
}) {
  const theme = useTheme();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [busy, setBusy] = useState(false);
  const [scanned, setScanned] = useState(false);

  if (!permission) return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;

  if (!permission.granted) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          gap: theme.spacing.md,
          padding: theme.spacing.lg,
          backgroundColor: theme.colors.background,
        }}
      >
        <Ionicons name="camera-outline" size={40} color={theme.colors.textMuted} />
        <Text
          style={{ color: theme.colors.text, fontSize: theme.font.size.body, textAlign: "center" }}
        >
          {permission.canAskAgain
            ? "Allow camera access to take a photo."
            : "Camera access is off. Turn it on in your phone's Settings for this app."}
        </Text>
        <Pressable
          accessibilityRole="button"
          onPress={() => (permission.canAskAgain ? requestPermission() : Linking.openSettings())}
          style={({ pressed }) => ({
            backgroundColor: theme.colors.primary,
            opacity: pressed ? 0.85 : 1,
            borderRadius: theme.radius.pill,
            paddingVertical: theme.spacing.sm,
            paddingHorizontal: theme.spacing.lg,
          })}
        >
          <Text style={{ color: theme.colors.onPrimary, fontWeight: theme.font.weight.bold }}>
            {permission.canAskAgain ? "Allow camera" : "Open Settings"}
          </Text>
        </Pressable>
        {onCancel ? (
          <Pressable accessibilityRole="button" onPress={onCancel} hitSlop={12}>
            <Text style={{ color: theme.colors.textMuted }}>Not now</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  async function takePhoto() {
    if (!camera.current || busy) return;
    setBusy(true);
    try {
      const picture = await camera.current.takePictureAsync({ base64: true, quality: 0.6 });
      if (picture)
        onCapture?.({
          uri: picture.uri,
          base64: picture.base64 ?? null,
          width: picture.width,
          height: picture.height,
        });
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <CameraView
        ref={camera}
        style={{ flex: 1 }}
        facing={facing}
        barcodeScannerSettings={
          onBarcode
            ? { barcodeTypes: ["qr", "ean13", "ean8", "upc_a", "upc_e", "code128"] }
            : undefined
        }
        onBarcodeScanned={
          onBarcode && !scanned
            ? (result) => {
                setScanned(true);
                onBarcode(result.data);
              }
            : undefined
        }
      />
      {hint ? (
        <View
          style={{
            position: "absolute",
            top: theme.spacing.xl,
            left: theme.spacing.lg,
            right: theme.spacing.lg,
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
            padding: theme.spacing.sm,
          }}
        >
          <Text style={{ color: theme.colors.text, textAlign: "center" }}>{hint}</Text>
        </View>
      ) : null}
      <View
        style={{
          position: "absolute",
          bottom: theme.spacing.xl,
          left: 0,
          right: 0,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-evenly",
        }}
      >
        {onCancel ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close camera"
            onPress={onCancel}
            hitSlop={12}
          >
            <Ionicons name="close" size={30} color={theme.colors.onPrimary} />
          </Pressable>
        ) : null}
        {onCapture ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Take photo"
            onPress={takePhoto}
            style={({ pressed }) => ({
              width: 72,
              height: 72,
              borderRadius: 36,
              borderWidth: 5,
              borderColor: theme.colors.onPrimary,
              backgroundColor: theme.colors.primary,
              opacity: pressed || busy ? 0.7 : 1,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            {busy ? <ActivityIndicator color={theme.colors.onPrimary} /> : null}
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
