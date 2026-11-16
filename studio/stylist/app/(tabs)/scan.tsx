// Scan: break down a look you saw (and check it against your closet), or rate today's fit.
import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GarmentArt } from "../../components/GarmentArt";
import { Lottie } from "../../components/lottie";
import { Appear, Float, PressScale, Stagger } from "../../components/motion";
import { useProfile } from "../../components/profile";
import { matchInCloset, rateFit, scanLook } from "../../components/stylist";
import { Body, Button, Card, Chip, Display, Eyebrow } from "../../components/ui";
import { track } from "../../data/analytics";
import { setAnswer } from "../../data/app-state";
import { keepPhoto, pickPhoto } from "../../data/photos";
import { useCollection } from "../../data/repo";
import { newLook, shortDay, type Item, type Look } from "../../data/schema";
import { useTheme } from "../../theme/ThemeProvider";

type Mode = "shop" | "rate";

const COPY: Record<Mode, { title: string; body: string; primary: string; secondary: string }> = {
  shop: {
    title: "Shop the look",
    body: "Screenshot an outfit you love from TikTok, Instagram or a store and upload it. You'll get every piece named, what you already own that's close, and searches for the rest.",
    primary: "Upload a screenshot",
    secondary: "Take a photo",
  },
  rate: {
    title: "Rate my fit",
    body: "Take a mirror photo of what you're wearing. You'll get a score, what's working, and two changes, with swaps from your own closet.",
    primary: "Take a mirror photo",
    secondary: "Choose a photo",
  },
};

export default function Scan() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ mode?: string }>();
  const [mode, setMode] = useState<Mode>(params.mode === "rate" ? "rate" : "shop");
  useEffect(() => {
    if (params.mode === "rate" || params.mode === "shop") setMode(params.mode);
  }, [params.mode]);

  const looks = useCollection<Look>("looks");
  const items = useCollection<Item>("items");
  const profile = useProfile();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const recent = looks.items
    .filter((l) => l.kind === mode)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 6);
  const copy = COPY[mode];

  async function start(source: "library" | "camera") {
    if (busy) return;
    setError(null);
    const photo = await pickPhoto({ source });
    if (!photo) return;
    setBusy(mode === "shop" ? "Finding every piece…" : "Looking at your fit…");
    try {
      if (mode === "shop") {
        const result = await scanLook(photo, profile.wear);
        if (!result) {
          setError(
            "That doesn't look like an outfit. Try a photo or screenshot where the clothes are clear.",
          );
          return;
        }
        const kept = await keepPhoto(photo);
        const look = await looks.add(
          newLook("shop", {
            title: result.title,
            pieces: result.pieces,
            photoUri: kept.uri,
            saved: true,
          }),
        );
        const owned = result.pieces.filter((p) => matchInCloset(p, items.items)).length;
        track("look_scanned", { pieces: result.pieces.length, owned });
        router.push(`/look/${look.id}`);
      } else {
        const rating = await rateFit(photo, items.items);
        if (!rating) {
          setError(
            "We couldn't see an outfit in that photo. A full-length mirror photo works best.",
          );
          return;
        }
        const kept = await keepPhoto(photo);
        const look = await looks.add(
          newLook("rate", {
            title: rating.headline || "Your fit, rated",
            score: rating.score,
            strengths: rating.strengths,
            tweaks: rating.tweaks,
            itemIds: rating.swapIds,
            photoUri: kept.uri,
            saved: true,
          }),
        );
        track("fit_rated", { score_band: Math.floor(rating.score) });
        router.push(`/look/${look.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: theme.colors.background }}
      contentContainerStyle={{
        paddingTop: insets.top + theme.spacing.md,
        paddingHorizontal: theme.spacing.lg,
        paddingBottom: theme.spacing.xl * 2,
        gap: theme.spacing.lg,
      }}
    >
      <Stagger step={60} style={{ gap: theme.spacing.lg }}>
        <View style={{ gap: 4 }}>
          <Eyebrow>Scan</Eyebrow>
          <Display>{copy.title}</Display>
        </View>
        <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
          <Chip
            role="radio"
            label="Shop the look"
            selected={mode === "shop"}
            onPress={() => setMode("shop")}
          />
          <Chip
            role="radio"
            label="Rate my fit"
            selected={mode === "rate"}
            onPress={() => setMode("rate")}
          />
        </View>

        <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
          <Float>
            <View style={{ flexDirection: "row", justifyContent: "center", gap: theme.spacing.sm }}>
              {mode === "shop" ? (
                <>
                  <GarmentArt category="outerwear" colors={["camel"]} size={84} />
                  <GarmentArt category="top" colors={["cream"]} size={72} />
                  <GarmentArt category="shoes" colors={["brown"]} size={64} />
                </>
              ) : (
                <>
                  <GarmentArt category="top" colors={["navy"]} size={76} />
                  <GarmentArt category="bottom" colors={["beige"]} size={84} />
                </>
              )}
            </View>
          </Float>
          <Body>{copy.body}</Body>
          {!profile.photoNoticeSeen ? (
            <View
              style={{
                gap: theme.spacing.sm,
                padding: theme.spacing.md,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surfaceAlt,
              }}
            >
              <View style={{ flexDirection: "row", gap: theme.spacing.sm, alignItems: "center" }}>
                <Ionicons name="shield-checkmark-outline" size={18} color={theme.colors.text} />
                <Text
                  style={{
                    fontWeight: theme.font.weight.bold,
                    color: theme.colors.text,
                    fontSize: theme.font.size.body,
                  }}
                >
                  Before your first scan
                </Text>
              </View>
              <Body muted>
                The photo you choose is sent to our AI provider to read the clothes in it. It's used
                only to answer you and isn't kept by them. Your copy stays on this phone, in Looks.
              </Body>
              <Button
                label="Got it"
                kind="outline"
                onPress={() => void setAnswer("photoNotice", "1")}
              />
            </View>
          ) : busy ? (
            <View
              style={{
                alignItems: "center",
                gap: theme.spacing.sm,
                paddingVertical: theme.spacing.md,
              }}
            >
              <Lottie name="loading" size={64} />
              <Body muted>{busy}</Body>
            </View>
          ) : (
            <View style={{ gap: theme.spacing.sm }}>
              <Button
                label={copy.primary}
                icon={mode === "shop" ? "image-outline" : "camera-outline"}
                onPress={() => void start(mode === "shop" ? "library" : "camera")}
              />
              <Button
                label={copy.secondary}
                kind="outline"
                icon={mode === "shop" ? "camera-outline" : "image-outline"}
                onPress={() => void start(mode === "shop" ? "camera" : "library")}
              />
            </View>
          )}
          {error ? (
            <Text style={{ color: theme.colors.danger, fontSize: theme.font.size.body }}>
              {error}
            </Text>
          ) : null}
        </Card>

        {recent.length ? (
          <View style={{ gap: theme.spacing.sm }}>
            <Eyebrow>{mode === "shop" ? "Your scans" : "Your ratings"}</Eyebrow>
            {recent.map((look, index) => (
              <Appear key={look.id} delay={Math.min(index, 8) * 50}>
                <PressScale
                  onPress={() => router.push(`/look/${look.id}`)}
                  accessibilityRole="button"
                  accessibilityLabel={`${look.title}, ${shortDay(look.date)}`}
                >
                  <Card
                    style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.md }}
                  >
                    {look.kind === "rate" && look.score !== null ? (
                      <Display size="headline" style={{ minWidth: 48 }}>
                        {look.score.toFixed(1)}
                      </Display>
                    ) : (
                      <GarmentArt
                        category={look.pieces[0]?.category ?? "top"}
                        colors={[look.pieces[0]?.shade ?? "print"]}
                        size={48}
                      />
                    )}
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text
                        style={{
                          fontSize: theme.font.size.body,
                          fontWeight: theme.font.weight.medium,
                          color: theme.colors.text,
                        }}
                      >
                        {look.title}
                      </Text>
                      <Text
                        style={{
                          fontSize: theme.font.size.caption + 1,
                          color: theme.colors.textMuted,
                        }}
                      >
                        {shortDay(look.date)}
                        {look.kind === "shop" ? ` · ${look.pieces.length} pieces` : ""}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                  </Card>
                </PressScale>
              </Appear>
            ))}
          </View>
        ) : null}
      </Stagger>
    </ScrollView>
  );
}
