// Looks: what you wore and saved, the looks you scanned and the fits you rated.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GarmentArt } from "../../components/GarmentArt";
import { Appear, PressScale, SkeletonList } from "../../components/motion";
import { Body, Button, Card, Chip, Display, Eyebrow, ItemArt } from "../../components/ui";
import { useCollection } from "../../data/repo";
import { shortDay, type Item, type Look } from "../../data/schema";
import { useTheme } from "../../theme/ThemeProvider";

type Filter = "all" | "worn" | "shop" | "rate";

const FILTERS: { id: Filter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "worn", label: "Worn" },
  { id: "shop", label: "Scanned" },
  { id: "rate", label: "Rated" },
];

export default function Looks() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const looks = useCollection<Look>("looks");
  const items = useCollection<Item>("items");
  const [filter, setFilter] = useState<Filter>("all");

  const shown = useMemo(
    () =>
      looks.items
        // An outfit only shows here once it was worn or saved; scans and ratings always do.
        .filter((l) => l.kind !== "outfit" || l.worn || l.saved)
        .filter((l) =>
          filter === "all"
            ? true
            : filter === "worn"
              ? l.kind === "outfit" && l.worn
              : l.kind === filter,
        )
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [looks.items, filter],
  );
  const wornCount = looks.items.filter((l) => l.kind === "outfit" && l.worn).length;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        data={looks.loading ? [] : shown}
        keyExtractor={(look) => look.id}
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.xl * 2,
          gap: theme.spacing.md,
        }}
        ListHeaderComponent={
          <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.sm }}>
            <View style={{ gap: 4 }}>
              <Eyebrow>
                {wornCount
                  ? `${wornCount} outfit${wornCount === 1 ? "" : "s"} worn`
                  : "Your lookbook"}
              </Eyebrow>
              <Display>Looks</Display>
            </View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: theme.spacing.sm }}
            >
              {FILTERS.map((f) => (
                <Chip
                  key={f.id}
                  role="radio"
                  label={f.label}
                  selected={filter === f.id}
                  onPress={() => setFilter(f.id)}
                />
              ))}
            </ScrollView>
          </View>
        }
        ListEmptyComponent={
          looks.loading ? (
            <SkeletonList rows={3} />
          ) : (
            <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.lg }}>
              <Display size="headline">Nothing saved yet</Display>
              <Body muted>
                Outfits you wear or heart on Today land here, with every look you scan and fit you
                rate.
              </Body>
              <Button label="See today's outfit" onPress={() => router.push("/")} />
            </View>
          )
        }
        renderItem={({ item: look, index }) => (
          <Appear delay={Math.min(index, 8) * 50}>
            <PressScale
              onPress={() => router.push(`/look/${look.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${look.title}, ${shortDay(look.date)}`}
            >
              <Card style={{ gap: theme.spacing.sm }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <Eyebrow>
                    {look.kind === "outfit"
                      ? look.worn
                        ? "Worn"
                        : "Saved"
                      : look.kind === "shop"
                        ? "Scanned"
                        : "Rated"}{" "}
                    · {shortDay(look.date)}
                  </Eyebrow>
                  <Ionicons name="chevron-forward" size={18} color={theme.colors.textMuted} />
                </View>
                <Display size="title">{look.title}</Display>
                <LookStrip look={look} items={items.items} />
              </Card>
            </PressScale>
          </Appear>
        )}
      />
    </View>
  );
}

function LookStrip({ look, items }: { look: Look; items: Item[] }) {
  const theme = useTheme();
  if (look.kind === "rate") {
    return (
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: theme.spacing.sm }}>
        <Display size="headline" color={theme.colors.accent}>
          {look.score?.toFixed(1) ?? "–"}
        </Display>
        <Text style={{ color: theme.colors.textMuted, fontSize: theme.font.size.body }}>
          out of 10
        </Text>
      </View>
    );
  }
  if (look.kind === "shop") {
    return (
      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        {look.pieces.slice(0, 5).map((p, i) => (
          <View
            key={`${p.name}-${i}`}
            style={{
              width: 52,
              height: 52,
              borderRadius: theme.radius.sm,
              backgroundColor: theme.colors.surfaceAlt,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <GarmentArt category={p.category} colors={[p.shade]} name={p.name} size={42} />
          </View>
        ))}
      </View>
    );
  }
  const pieces = look.itemIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is Item => Boolean(i));
  return (
    <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
      {pieces.slice(0, 5).map((item) => (
        <ItemArt key={item.id} item={item} size={52} />
      ))}
    </View>
  );
}
