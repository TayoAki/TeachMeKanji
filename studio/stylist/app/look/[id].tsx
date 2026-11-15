// A look: an outfit you wore or saved, a scanned look checked against your closet, or a rated fit.
import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { Stack, router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Linking, ScrollView, Text, View, useWindowDimensions } from "react-native";
import Svg, { Circle } from "react-native-svg";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GarmentArt } from "../../components/GarmentArt";
import { useShareImage } from "../../components/share";
import { Appear, CountUp, Skeleton, Stagger } from "../../components/motion";
import { STORES, matchInCloset, pieceLabel } from "../../components/stylist";
import { Body, Button, Card, Display, Eyebrow, ItemArt, OutfitBoard } from "../../components/ui";
import { formatTemp } from "../../components/weather";
import { useProfile } from "../../components/profile";
import { track } from "../../data/analytics";
import { inviteFriends } from "../../data/growth";
import { forgetPhoto, photoUri } from "../../data/photos";
import { useCollection } from "../../data/repo";
import { OCCASIONS, shortDay, type Item, type Look, type Piece } from "../../data/schema";
import { useTheme } from "../../theme/ThemeProvider";

export default function LookDetail() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const looks = useCollection<Look>("looks");
  const items = useCollection<Item>("items");
  const look = looks.items.find((l) => l.id === id);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (looks.loading || items.loading) {
    return (
      <View
        style={{
          flex: 1,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          backgroundColor: theme.colors.background,
        }}
      >
        <Skeleton width={180} height={14} />
        <Skeleton width={260} height={30} />
        <Skeleton width={width - theme.spacing.lg * 2} height={220} />
      </View>
    );
  }
  if (!look) {
    return (
      <View
        style={{
          flex: 1,
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          backgroundColor: theme.colors.background,
        }}
      >
        <Stack.Screen options={{ title: "Look" }} />
        <Display size="headline">This look was removed</Display>
        <Button label="Back to Looks" onPress={() => router.replace("/looks")} />
      </View>
    );
  }

  async function deleteIt() {
    if (!look) return;
    if (look.photoUri) forgetPhoto(look.photoUri);
    await looks.remove(look.id);
    router.back();
  }

  const title =
    look.kind === "outfit" ? "Outfit" : look.kind === "shop" ? "Scanned look" : "Rated fit";
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title }} />
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
      >
        <Stagger step={60} style={{ gap: theme.spacing.lg }}>
          {look.kind === "outfit" ? <OutfitView look={look} items={items.items} /> : null}
          {look.kind === "shop" ? <ShopView look={look} items={items.items} /> : null}
          {look.kind === "rate" ? <RateView look={look} items={items.items} /> : null}
          {confirmDelete ? (
            <Card style={{ borderColor: theme.colors.danger }}>
              <Body>
                Delete this look{look.photoUri ? " and its photo" : ""}? This can't be undone.
              </Body>
              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                <Button
                  label="Delete"
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
                label="Delete this look"
                kind="text"
                icon="trash-outline"
                onPress={() => setConfirmDelete(true)}
              />
            </View>
          )}
        </Stagger>
      </ScrollView>
    </View>
  );
}

function OutfitView({ look, items }: { look: Look; items: Item[] }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const profile = useProfile();
  const { ref, share, sharing } = useShareImage();
  const pieces = look.itemIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is Item => Boolean(i));
  const occasion = OCCASIONS.find((o) => o.id === look.occasion)?.label;
  const cardWidth = width - theme.spacing.lg * 2;
  return (
    <>
      <View
        ref={ref}
        collapsable={false}
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
          gap: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <Eyebrow>
          {shortDay(look.date)}
          {look.weather
            ? ` · ${formatTemp(look.weather.tempC, profile.unit)} ${look.weather.label}`
            : ""}
          {occasion ? ` · ${occasion}` : ""}
        </Eyebrow>
        <Display size="headline">{look.title}</Display>
        <OutfitBoard items={pieces} width={cardWidth - theme.spacing.md * 2} />
        {look.note ? <Body>{look.note}</Body> : null}
        <Text style={{ fontSize: theme.font.size.caption, color: theme.colors.textMuted }}>
          Styled from my own closet with Closetcast
        </Text>
      </View>
      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Button
          label="Share this look"
          icon="share-outline"
          loading={sharing}
          onPress={() => {
            track("look_shared", { kind: "outfit" });
            void share({ message: `Today's outfit, picked from my own closet: ${look.title}.` });
          }}
          style={{ flex: 1 }}
        />
        <Button
          label="Invite a friend"
          kind="outline"
          onPress={() =>
            void inviteFriends(
              "Closetcast builds my outfit from my own closet every morning, for the weather. Try it:",
            )
          }
          style={{ flex: 1 }}
        />
      </View>
      {pieces.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Eyebrow>The pieces</Eyebrow>
          {pieces.map((item) => (
            <Text
              key={item.id}
              onPress={() => router.push(`/item/${item.id}`)}
              accessibilityRole="link"
              style={{
                fontSize: theme.font.size.body,
                color: theme.colors.text,
                paddingVertical: 6,
              }}
            >
              {item.name}
            </Text>
          ))}
        </View>
      ) : null}
    </>
  );
}

function ShopView({ look, items }: { look: Look; items: Item[] }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const matches = look.pieces.map((p) => matchInCloset(p, items));
  const owned = matches.filter(Boolean).length;
  return (
    <>
      {look.photoUri ? (
        <Image
          source={{ uri: photoUri(look.photoUri) }}
          style={{
            width: width - theme.spacing.lg * 2,
            height: 320,
            borderRadius: theme.radius.lg,
          }}
          contentFit="cover"
          accessibilityLabel="The look you scanned"
        />
      ) : null}
      <View style={{ gap: theme.spacing.xs }}>
        <Eyebrow>
          {shortDay(look.date)} · {look.pieces.length} pieces
        </Eyebrow>
        <Display size="headline">{look.title}</Display>
      </View>
      <Card
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: theme.spacing.md,
          backgroundColor: theme.colors.surfaceAlt,
          borderColor: theme.colors.surfaceAlt,
        }}
      >
        <Display size="headline" color={theme.colors.accent}>
          {owned}/{look.pieces.length}
        </Display>
        <Body style={{ flex: 1 }}>
          {owned === 0
            ? "Nothing close in your closet yet. Here's where to find each piece."
            : owned === look.pieces.length
              ? "You can already make this look from your closet."
              : `You own ${owned} of these. Here's your version, and where to get the rest.`}
        </Body>
      </Card>
      {look.pieces.map((piece, i) => (
        <Appear key={`${piece.name}-${i}`} delay={Math.min(i, 8) * 50}>
          <PieceCard piece={piece} match={matches[i] ?? null} />
        </Appear>
      ))}
      <Text style={{ fontSize: theme.font.size.caption, color: theme.colors.textMuted }}>
        Store links are searches for similar pieces, not ads. Closetcast doesn't earn from them.
      </Text>
    </>
  );
}

function PieceCard({ piece, match }: { piece: Piece; match: ReturnType<typeof matchInCloset> }) {
  const theme = useTheme();
  const [showLinks, setShowLinks] = useState(!match);
  return (
    <Card style={{ gap: theme.spacing.sm }}>
      <View style={{ flexDirection: "row", gap: theme.spacing.md, alignItems: "center" }}>
        <View
          style={{
            width: 64,
            height: 64,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <GarmentArt
            category={piece.category}
            colors={[piece.shade]}
            name={piece.name}
            size={52}
          />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text
            style={{
              fontSize: theme.font.size.body,
              fontWeight: theme.font.weight.bold,
              color: theme.colors.text,
            }}
          >
            {piece.name}
          </Text>
          <Text style={{ fontSize: theme.font.size.caption + 1, color: theme.colors.textMuted }}>
            {pieceLabel(piece)}
            {piece.details ? ` · ${piece.details}` : ""}
          </Text>
        </View>
      </View>
      {match ? (
        <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
          <Ionicons
            name={match.exact ? "checkmark-circle" : "swap-horizontal"}
            size={18}
            color={theme.colors.success}
          />
          <Text
            onPress={() => router.push(`/item/${match.item.id}`)}
            accessibilityRole="link"
            style={{ flex: 1, fontSize: theme.font.size.caption + 2, color: theme.colors.text }}
          >
            {match.exact ? "You own this: " : "Close in your closet: "}
            <Text style={{ fontWeight: theme.font.weight.bold }}>{match.item.name}</Text>
          </Text>
        </View>
      ) : null}
      {showLinks ? (
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
          {STORES.map((store) => (
            <Button
              key={store.id}
              label={store.label}
              kind="outline"
              icon="open-outline"
              onPress={() => {
                track("shop_link_opened", { store: store.id, owned: Boolean(match) });
                void Linking.openURL(store.url(piece.query));
              }}
              style={{ minHeight: 44, paddingHorizontal: theme.spacing.md }}
            />
          ))}
        </View>
      ) : (
        <Button label="Shop it anyway" kind="text" onPress={() => setShowLinks(true)} />
      )}
    </Card>
  );
}

function ScoreRing({ score }: { score: number }) {
  const theme = useTheme();
  const size = 132;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: "absolute" }}
      >
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={theme.colors.surfaceAlt}
          strokeWidth={stroke}
          fill="none"
        />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={theme.colors.accent}
          strokeWidth={stroke}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${c} ${c}`}
          strokeDashoffset={c * (1 - score / 10)}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </Svg>
      <CountUp
        value={score}
        format={(n) => n.toFixed(1)}
        style={{
          fontSize: theme.font.size.display,
          color: theme.colors.text,
          fontVariant: ["tabular-nums"],
        }}
      />
    </View>
  );
}

function RateView({ look, items }: { look: Look; items: Item[] }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const { ref, share, sharing } = useShareImage();
  const swaps = look.itemIds
    .map((id) => items.find((i) => i.id === id))
    .filter((i): i is Item => Boolean(i));
  return (
    <>
      <View
        ref={ref}
        collapsable={false}
        style={{
          backgroundColor: theme.colors.surface,
          borderRadius: theme.radius.lg,
          padding: theme.spacing.md,
          gap: theme.spacing.md,
          borderWidth: 1,
          borderColor: theme.colors.border,
        }}
      >
        <View style={{ flexDirection: "row", gap: theme.spacing.md, alignItems: "center" }}>
          {look.photoUri ? (
            <Image
              source={{ uri: photoUri(look.photoUri) }}
              style={{
                width: (width - theme.spacing.lg * 2) * 0.4,
                height: 190,
                borderRadius: theme.radius.md,
              }}
              contentFit="cover"
              accessibilityLabel="Your outfit photo"
            />
          ) : null}
          <View style={{ flex: 1, alignItems: "center", gap: theme.spacing.sm }}>
            <ScoreRing score={look.score ?? 0} />
            <Eyebrow>out of 10</Eyebrow>
          </View>
        </View>
        <Display size="headline">{look.title}</Display>
        <Text style={{ fontSize: theme.font.size.caption, color: theme.colors.textMuted }}>
          Rated by Closetcast · {shortDay(look.date)}
        </Text>
      </View>
      {look.strengths.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Eyebrow>What's working</Eyebrow>
          {look.strengths.map((s) => (
            <View key={s} style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              <Ionicons name="checkmark-circle-outline" size={20} color={theme.colors.success} />
              <Body style={{ flex: 1 }}>{s}</Body>
            </View>
          ))}
        </View>
      ) : null}
      {look.tweaks.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Eyebrow>Try this</Eyebrow>
          {look.tweaks.map((s) => (
            <View key={s} style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              <Ionicons name="arrow-forward-circle-outline" size={20} color={theme.colors.accent} />
              <Body style={{ flex: 1 }}>{s}</Body>
            </View>
          ))}
        </View>
      ) : null}
      {swaps.length ? (
        <View style={{ gap: theme.spacing.sm }}>
          <Eyebrow>Swaps from your closet</Eyebrow>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            {swaps.map((item) => (
              <View key={item.id} style={{ width: 110, gap: 4 }}>
                <ItemArt item={item} size={110} />
                <Text
                  numberOfLines={2}
                  style={{ fontSize: theme.font.size.caption, color: theme.colors.text }}
                >
                  {item.name}
                </Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
        <Button
          label="Share my score"
          icon="share-outline"
          loading={sharing}
          onPress={() => {
            track("look_shared", { kind: "rate" });
            void share({
              message: `My fit scored ${look.score?.toFixed(1) ?? "?"}/10 on Closetcast.`,
            });
          }}
          style={{ flex: 1 }}
        />
        <Button
          label="Rate a friend"
          kind="outline"
          onPress={() =>
            void inviteFriends(
              "Closetcast rates outfits and suggests swaps from your own closet. Try it on yours:",
            )
          }
          style={{ flex: 1 }}
        />
      </View>
    </>
  );
}
