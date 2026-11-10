// TEMPLATE FILE — owned by the platform, never written by the model.
// Share a card as an image: wrap the card in <View ref={ref} collapsable={false}>, then call
// share({ message }). On a phone the card is captured and shared as a PNG; where that isn't
// possible (the web preview) the message is shared as text instead.
import { useRef, useState, type ComponentRef } from "react";
import { Platform, Share, type View } from "react-native";
import { captureRef } from "react-native-view-shot";
import { isAvailableAsync, shareAsync } from "expo-sharing";

export function useShareImage() {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const [sharing, setSharing] = useState(false);

  /** Share the card under `ref` as an image (falls back to `message` as text). */
  async function share(options: { message: string; title?: string }): Promise<boolean> {
    setSharing(true);
    try {
      if (ref.current && Platform.OS !== "web") {
        try {
          const uri = await captureRef(ref, { format: "png", quality: 1, result: "tmpfile" });
          if (await isAvailableAsync()) {
            await shareAsync(uri, {
              mimeType: "image/png",
              UTI: "public.png",
              dialogTitle: options.title ?? options.message,
            });
            return true;
          }
          await Share.share({ message: options.message, url: uri });
          return true;
        } catch {
          // Capture or the share sheet failed: share the text below.
        }
      }
      await Share.share({ message: options.message, title: options.title });
      return true;
    } catch {
      return false;
    } finally {
      setSharing(false);
    }
  }

  return { ref, share, sharing };
}
