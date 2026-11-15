// One piece: how often it's worn, edit it, favorite it, or remove it.
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useEffect, useState, type ReactNode } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ItemForm, type ItemFields } from "../../components/ItemForm";
import { Appear, CountUp, Skeleton } from "../../components/motion";
import { Body, Button, Card, Display, Eyebrow, ItemArt } from "../../components/ui";
import { forgetPhoto } from "../../data/photos";
import { useCollection } from "../../data/repo";
import {
  FORMALITY_LABELS,
  WARMTH_LABELS,
  categoryLabel,
  colorLabel,
  dayKey,
  daysBetween,
  shortDay,
  type Item,
} from "../../data/schema";
import { useTheme } from "../../theme/ThemeProvider";

export default function ItemDetail() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { items, loading, update, remove } = useCollection<Item>("items");
  const item = items.find((i) => i.id === id);
  const [editing, setEditing] = useState<ItemFields | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => setConfirmDelete(false), [id]);

  if (loading) {
    return (
      <View
        style={{
          flex: 1,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          backgroundColor: theme.colors.background,
        }}
      >
        <Skeleton width={width - theme.spacing.lg * 2} height={260} />
        <Skeleton width={200} height={28} />
      </View>
    );
  }
  if (!item) {
    return (
      <View
        style={{
          flex: 1,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          backgroundColor: theme.colors.background,
        }}
      >
        <Stack.Screen options={{ title: "Piece" }} />
        <Display size="headline">This piece isn't in your closet anymore</Display>
        <Button label="Back to Closet" onPress={() => router.replace("/closet")} />
      </View>
    );
  }

  const idle = item.lastWornOn ? daysBetween(item.lastWornOn, dayKey()) : null;

  async function saveEdit() {
    if (!item || !editing || !editing.name.trim() || !editing.colors.length) return;
    await update(item.id, { ...editing, name: editing.name.trim() });
    setEditing(null);
  }

  async function deleteIt() {
    if (!item) return;
    if (item.photoUri) forgetPhoto(item.photoUri);
    await remove(item.id);
    router.back();
  }

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: categoryLabel(item.category) }} />
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
      >
        <Appear style={{ alignItems: "center" }}>
          <ItemArt item={item} size={Math.min(width - theme.spacing.lg * 2, 300)} />
        </Appear>
        {editing ? (
          <>
            <ItemForm value={editing} onChange={setEditing} />
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              <Button label="Save changes" onPress={() => void saveEdit()} style={{ flex: 1 }} />
              <Button
                label="Cancel"
                kind="outline"
                onPress={() => setEditing(null)}
                style={{ flex: 1 }}
              />
            </View>
          </>
        ) : (
          <>
            <View style={{ gap: theme.spacing.xs }}>
              <Eyebrow>
                {item.colors.map(colorLabel).join(" & ")} · {WARMTH_LABELS[item.warmth]} ·{" "}
                {FORMALITY_LABELS[item.formality]}
              </Eyebrow>
              <Display size="headline">{item.name}</Display>
            </View>
            <Card style={{ flexDirection: "row", justifyContent: "space-around" }}>
              <Stat label="Times worn">
                <CountUp
                  value={item.wornCount}
                  style={{ fontSize: theme.font.size.headline, color: theme.colors.text }}
                />
              </Stat>
              <Stat label="Last worn">
                <Text style={{ fontSize: theme.font.size.title, color: theme.colors.text }}>
                  {item.lastWornOn ? shortDay(item.lastWornOn) : "Not yet"}
                </Text>
              </Stat>
            </Card>
            {idle !== null && idle >= 30 ? (
              <Body muted>
                Not worn for {idle} days. Outfits will bring it back in when the weather suits it.
              </Body>
            ) : null}
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              <Button
                label={item.favorite ? "Favorite" : "Make favorite"}
                icon={item.favorite ? "heart" : "heart-outline"}
                kind="outline"
                onPress={() => void update(item.id, { favorite: !item.favorite })}
                style={{ flex: 1 }}
              />
              <Button
                label="Edit"
                icon="create-outline"
                kind="outline"
                onPress={() =>
                  setEditing({
                    name: item.name,
                    category: item.category,
                    colors: item.colors,
                    warmth: item.warmth,
                    formality: item.formality,
                  })
                }
                style={{ flex: 1 }}
              />
            </View>
            {confirmDelete ? (
              <Card style={{ borderColor: theme.colors.danger }}>
                <Body>Remove {item.name} from your closet? Past looks keep their record.</Body>
                <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                  <Button
                    label="Remove"
                    onPress={() => void deleteIt()}
                    style={{ flex: 1, backgroundColor: theme.colors.danger }}
                  />
                  <Button
                    label="Keep it"
                    kind="outline"
                    onPress={() => setConfirmDelete(false)}
                    style={{ flex: 1 }}
                  />
                </View>
              </Card>
            ) : (
              <View style={{ flexDirection: "row", justifyContent: "center" }}>
                <Button
                  label="Remove from closet"
                  kind="text"
                  icon="trash-outline"
                  onPress={() => setConfirmDelete(true)}
                />
              </View>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <View style={{ alignItems: "center", gap: 4 }}>
      {children}
      <Text
        style={{
          fontSize: theme.font.size.caption,
          color: theme.colors.textMuted,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        {label}
      </Text>
    </View>
  );
}
