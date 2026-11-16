// The closet: every piece, by type, with photos or drawings, and the way to add more.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { FlatList, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Appear, PressScale, SkeletonList } from "../../components/motion";
import { Body, Button, Chip, Display, Eyebrow, ItemArt } from "../../components/ui";
import { useCollection } from "../../data/repo";
import { CATEGORIES, type Category, type Item } from "../../data/schema";
import { useTheme } from "../../theme/ThemeProvider";

const COLUMNS = 3;

export default function Closet() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { items, loading } = useCollection<Item>("items");
  const [filter, setFilter] = useState<Category | "all">("all");

  const shown = useMemo(
    () =>
      items
        .filter((i) => filter === "all" || i.category === filter)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [items, filter],
  );
  const gap = theme.spacing.sm;
  const tile = Math.floor((width - theme.spacing.lg * 2 - gap * (COLUMNS - 1)) / COLUMNS);

  function add() {
    router.push("/add-item");
  }

  const header = (
    <View style={{ gap: theme.spacing.md, paddingBottom: theme.spacing.md }}>
      <View
        style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}
      >
        <View style={{ gap: 4 }}>
          <Eyebrow>
            {loading ? "Your closet" : `${items.length} piece${items.length === 1 ? "" : "s"}`}
          </Eyebrow>
          <Display>Closet</Display>
        </View>
        <PressScale
          onPress={add}
          accessibilityRole="button"
          accessibilityLabel="Add a piece"
          scaleTo={0.94}
          haptic="light"
          style={{
            width: 52,
            height: 52,
            borderRadius: 26,
            backgroundColor: theme.colors.primary,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="add" size={26} color={theme.colors.onPrimary} />
        </PressScale>
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: theme.spacing.sm }}
      >
        <Chip
          role="radio"
          label="All"
          selected={filter === "all"}
          onPress={() => setFilter("all")}
        />
        {CATEGORIES.map((c) => (
          <Chip
            key={c.id}
            role="radio"
            label={c.plural}
            selected={filter === c.id}
            onPress={() => setFilter(c.id)}
          />
        ))}
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <FlatList
        data={loading ? [] : shown}
        keyExtractor={(item) => item.id}
        numColumns={COLUMNS}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.xl * 2,
          gap,
        }}
        ListHeaderComponent={header}
        ListEmptyComponent={
          loading ? (
            <SkeletonList rows={4} />
          ) : (
            <View style={{ gap: theme.spacing.md, paddingTop: theme.spacing.lg }}>
              <Display size="headline">
                {filter === "all"
                  ? "Nothing here yet"
                  : `No ${CATEGORIES.find((c) => c.id === filter)?.plural.toLowerCase()} yet`}
              </Display>
              <Body muted>
                Add what you wear most. Tapping the basics you own takes a minute; photos make
                outfits look like you.
              </Body>
              <Button label="Tap the basics I own" onPress={() => router.push("/basics")} />
              <Button
                label="Add a piece with a photo"
                kind="outline"
                icon="camera-outline"
                onPress={add}
              />
            </View>
          )
        }
        renderItem={({ item, index }) => (
          <Appear delay={Math.min(index, 8) * 50}>
            <PressScale
              onPress={() => router.push(`/item/${item.id}`)}
              accessibilityRole="button"
              accessibilityLabel={`${item.name}${item.favorite ? ", favorite" : ""}`}
              style={{ width: tile, gap: 6 }}
            >
              <ItemArt item={item} size={tile} />
              <View style={{ flexDirection: "row", gap: 4 }}>
                {item.favorite ? (
                  <Ionicons
                    name="heart"
                    size={13}
                    color={theme.colors.accent}
                    style={{ marginTop: 2 }}
                  />
                ) : null}
                <Text
                  numberOfLines={2}
                  style={{
                    flex: 1,
                    fontSize: theme.font.size.caption + 1,
                    color: theme.colors.text,
                  }}
                >
                  {item.name}
                </Text>
              </View>
            </PressScale>
          </Appear>
        )}
      />
    </View>
  );
}
