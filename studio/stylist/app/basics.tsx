// Add pieces by tapping the basics you own: no photos needed.
import { Stack, router } from "expo-router";
import { useMemo, useState } from "react";
import { ScrollView, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GarmentArt } from "../components/GarmentArt";
import { Appear } from "../components/motion";
import { useProfile, wearCodes } from "../components/profile";
import { Body, Button, Eyebrow, SelectTile } from "../components/ui";
import { track } from "../data/analytics";
import { basics } from "../data/content/basics";
import { useCollection } from "../data/repo";
import { CATEGORIES, type Item } from "../data/schema";
import { useTheme } from "../theme/ThemeProvider";

export default function Basics() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const profile = useProfile();
  const items = useCollection<Item>("items");
  const [picked, setPicked] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const owned = new Set(items.items.map((i) => i.name));
  const offered = useMemo(
    () => basics.filter((b) => wearCodes(profile.wear).includes(b.wear) && !owned.has(b.name)),
    // owned changes with the closet
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [profile.wear, items.items],
  );
  const tile = Math.floor((width - theme.spacing.lg * 2 - theme.spacing.sm * 2) / 3);

  async function save() {
    if (!picked.length) return;
    setSaving(true);
    const now = new Date().toISOString();
    for (const id of picked) {
      const b = basics.find((x) => x.id === id);
      if (!b) continue;
      await items.add({
        name: b.name,
        category: b.category,
        colors: b.colors,
        warmth: b.warmth,
        formality: b.formality,
        photoUri: null,
        favorite: false,
        wornCount: 0,
        lastWornOn: null,
        createdAt: now,
      });
    }
    track("pieces_added", { pieces: picked.length, source: "basics" });
    setSaving(false);
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: "Tap the basics you own" }} />
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          paddingBottom: theme.spacing.xl,
        }}
      >
        <Body muted>
          Pick what's in your closet. Outfits use them right away; you can add photos of your own
          pieces later.
        </Body>
        {CATEGORIES.map((c) => {
          const group = offered.filter((b) => b.category === c.id);
          if (!group.length) return null;
          return (
            <View key={c.id} style={{ gap: theme.spacing.sm }}>
              <Eyebrow>{c.plural}</Eyebrow>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                {group.map((b, i) => (
                  <Appear key={b.id} delay={Math.min(i, 8) * 40}>
                    <SelectTile
                      label={b.name}
                      width={tile}
                      selected={picked.includes(b.id)}
                      onPress={() =>
                        setPicked((all) =>
                          all.includes(b.id) ? all.filter((x) => x !== b.id) : [...all, b.id],
                        )
                      }
                    >
                      <GarmentArt category={b.category} colors={b.colors} name={b.name} size={64} />
                    </SelectTile>
                  </Appear>
                ))}
              </View>
            </View>
          );
        })}
        {!offered.length ? (
          <Body muted>
            You've added every basic we have. Add more pieces with a photo from Closet.
          </Body>
        ) : null}
      </ScrollView>
      <View style={{ padding: theme.spacing.lg, paddingBottom: insets.bottom + theme.spacing.md }}>
        <Button
          label={
            picked.length
              ? `Add ${picked.length} piece${picked.length === 1 ? "" : "s"}`
              : "Pick what you own"
          }
          disabled={!picked.length}
          loading={saving}
          onPress={() => void save()}
        />
      </View>
    </View>
  );
}
