// Add a piece with a photo: the AI fills in what it is, and the person checks it before saving.
import { Image } from "expo-image";
import { Stack, router } from "expo-router";
import { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItemForm, type ItemFields } from "../components/ItemForm";
import { Lottie } from "../components/lottie";
import { Appear } from "../components/motion";
import { useProfile } from "../components/profile";
import { tagPhoto } from "../components/stylist";
import { Body, Button, Card, Eyebrow, ItemArt } from "../components/ui";
import { track } from "../data/analytics";
import { setAnswer } from "../data/app-state";
import { keepPhoto, pickPhoto, type Photo } from "../data/photos";
import { useCollection } from "../data/repo";
import { type Item } from "../data/schema";
import { useTheme } from "../theme/ThemeProvider";

const BLANK: ItemFields = { name: "", category: "top", colors: [], warmth: 2, formality: 1 };

export default function AddItem() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const items = useCollection<Item>("items");
  const profile = useProfile();
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [fields, setFields] = useState<ItemFields | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function choose(source: "camera" | "library") {
    const picked = await pickPhoto({ source });
    if (!picked) return;
    setPhoto(picked);
    setFields(null);
    setStatus("Reading the photo…");
    try {
      const tagged = await tagPhoto(picked);
      if (tagged) {
        setFields(tagged);
        setStatus(null);
      } else {
        setFields(BLANK);
        setStatus(
          "We couldn't spot one piece of clothing. Fill it in below, or try a photo of just that piece.",
        );
      }
    } catch {
      setFields(BLANK);
      setStatus("The AI isn't reachable right now. Fill it in below; it takes a few seconds.");
    }
  }

  async function save() {
    if (!fields || !fields.name.trim() || !fields.colors.length) return;
    setSaving(true);
    const kept = photo ? await keepPhoto(photo) : null;
    await items.add({
      ...fields,
      name: fields.name.trim(),
      photoUri: kept?.uri ?? null,
      favorite: false,
      wornCount: 0,
      lastWornOn: null,
      createdAt: new Date().toISOString(),
    });
    track("pieces_added", {
      pieces: 1,
      source: photo ? "photo" : "manual",
      category: fields.category,
    });
    setSaving(false);
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: "Add a piece" }} />
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          paddingBottom: theme.spacing.xl,
        }}
      >
        {!photo && !fields ? (
          <Appear style={{ gap: theme.spacing.md }}>
            <Body>
              Photograph one piece flat or on a hanger, in good light. We'll fill in what it is; you
              check it before it's saved.
            </Body>
            {!profile.photoNoticeSeen ? (
              <Card
                style={{
                  backgroundColor: theme.colors.surfaceAlt,
                  borderColor: theme.colors.surfaceAlt,
                }}
              >
                <Eyebrow>About your photos</Eyebrow>
                <Body muted>
                  The photo is sent to our AI provider to recognize the piece. It's used only for
                  that and isn't kept by them. Your copy stays on this phone.
                </Body>
                <Button
                  label="Got it"
                  kind="outline"
                  onPress={() => void setAnswer("photoNotice", "1")}
                />
              </Card>
            ) : (
              <>
                <Button
                  label="Take a photo"
                  icon="camera-outline"
                  onPress={() => void choose("camera")}
                />
                <Button
                  label="Choose from photos"
                  kind="outline"
                  icon="image-outline"
                  onPress={() => void choose("library")}
                />
              </>
            )}
            <Button label="Add without a photo" kind="text" onPress={() => setFields(BLANK)} />
            <Button
              label="Tap the basics I own instead"
              kind="text"
              onPress={() => router.replace("/basics")}
            />
          </Appear>
        ) : (
          <View style={{ gap: theme.spacing.lg }}>
            <View style={{ alignItems: "center" }}>
              {photo ? (
                <Image
                  source={{ uri: photo.uri }}
                  style={{ width: 180, height: 180, borderRadius: theme.radius.lg }}
                  contentFit="cover"
                  accessibilityLabel="The photo you chose"
                />
              ) : fields ? (
                <ItemArt
                  item={{
                    category: fields.category,
                    colors: fields.colors.length ? fields.colors : ["print"],
                    photoUri: null,
                  }}
                  size={160}
                />
              ) : null}
            </View>
            {status && !fields ? (
              <View style={{ alignItems: "center", gap: theme.spacing.sm }}>
                <Lottie name="loading" size={56} />
                <Body muted>{status}</Body>
              </View>
            ) : null}
            {status && fields ? <Body muted>{status}</Body> : null}
            {fields ? (
              <Appear>
                <ItemForm value={fields} onChange={setFields} />
              </Appear>
            ) : null}
          </View>
        )}
      </ScrollView>
      {fields ? (
        <View
          style={{
            padding: theme.spacing.lg,
            paddingBottom: insets.bottom + theme.spacing.md,
            gap: theme.spacing.xs,
          }}
        >
          <Button
            label="Save to my closet"
            disabled={!fields.name.trim() || !fields.colors.length}
            loading={saving}
            onPress={() => void save()}
          />
        </View>
      ) : null}
    </View>
  );
}
