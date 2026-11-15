// Today: the outfit for today's weather and plans, from the person's own closet.
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Celebrate } from "../../components/lottie";
import { Appear, PressScale, Skeleton, Stagger } from "../../components/motion";
import { useAllowance, useProfile } from "../../components/profile";
import {
  aiOutfit,
  describeOutfit,
  isWearable,
  pickOutfit,
  type DayContext,
  type OutfitPlan,
} from "../../components/stylist";
import {
  Body,
  Button,
  Card,
  Chip,
  Display,
  Eyebrow,
  IconButton,
  OutfitBoard,
} from "../../components/ui";
import { fetchWeather, formatTemp, seasonalTempC, type Weather } from "../../components/weather";
import { track } from "../../data/analytics";
import { useHabit } from "../../data/habit";
import { usePurchases } from "../../data/purchases";
import { useCollection } from "../../data/repo";
import {
  OCCASIONS,
  dayKey,
  daysBetween,
  newLook,
  type Item,
  type Look,
  type Occasion,
} from "../../data/schema";
import { useTheme } from "../../theme/ThemeProvider";

function greeting(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function defaultOccasion(date: Date): Occasion {
  const day = date.getDay();
  return day === 0 || day === 6 ? "weekend" : "everyday";
}

export default function Today() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const items = useCollection<Item>("items");
  const looks = useCollection<Look>("looks");
  const profile = useProfile();
  const allowance = useAllowance();
  const habit = useHabit();
  const { openPaywall } = usePurchases();
  const now = new Date();
  const today = dayKey(now);

  const [weather, setWeather] = useState<Weather | null>(null);
  const [weatherReady, setWeatherReady] = useState(false);
  const [occasion, setOccasion] = useState<Occasion>(defaultOccasion(now));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [celebrate, setCelebrate] = useState(0);

  const lat = profile.place?.latitude;
  const lon = profile.place?.longitude;
  useEffect(() => {
    let alive = true;
    if (lat === undefined || lon === undefined) {
      setWeatherReady(true);
      return;
    }
    fetchWeather({ latitude: lat, longitude: lon, name: "" })
      .then((w) => alive && setWeather(w))
      .catch(() => alive && setWeather(null))
      .finally(() => alive && setWeatherReady(true));
    return () => {
      alive = false;
    };
  }, [lat, lon]);

  const tempC = weather?.tempC ?? seasonalTempC(now, lat);
  const rainChance = weather?.rainChance ?? 0;

  const current = useMemo(
    () =>
      looks.items
        .filter((l) => l.kind === "outfit" && l.date === today)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0] ?? null,
    [looks.items, today],
  );
  const outfitItems = useMemo(
    () =>
      (current?.itemIds ?? [])
        .map((id) => items.items.find((i) => i.id === id))
        .filter((i): i is Item => Boolean(i)),
    [current, items.items],
  );
  const closetReady = isWearable(items.items) && items.items.some((i) => i.category === "shoes");

  async function makeOutfit(reroll: boolean) {
    if (busy) return;
    if (reroll && !allowance.canReroll) {
      track("paywall_locked", { feature: "new_option" });
      openPaywall();
      return;
    }
    setBusy(true);
    setNotice(null);
    const recentIds = new Set(
      looks.items
        .filter(
          (l) =>
            l.kind === "outfit" && l.worn && daysBetween(l.date, today) <= 3 && l.date !== today,
        )
        .flatMap((l) => l.itemIds),
    );
    if (reroll && current) current.itemIds.forEach((id) => recentIds.add(id));
    const day: DayContext = {
      tempC,
      rainChance,
      occasion,
      recentIds,
      styles: profile.styles,
      wear: profile.wear,
      seed: Math.floor(Date.now() / 1000),
    };
    let plan: OutfitPlan | null = null;
    try {
      plan = await aiOutfit(
        items.items,
        day,
        items.items.filter((i) => recentIds.has(i.id)),
      );
    } catch {
      plan = null;
    }
    if (!plan) {
      const picked = pickOutfit(items.items, day);
      if (!isWearable(picked)) {
        setNotice(
          "Add a top and a bottom (or a dress) and some shoes, and today's outfit appears here.",
        );
        setBusy(false);
        return;
      }
      plan = { itemIds: picked.map((i) => i.id), ...describeOutfit(picked, day), source: "rules" };
    }
    if (current && !current.saved && !current.worn) await looks.remove(current.id);
    await looks.add(
      newLook("outfit", {
        title: plan.title,
        note: plan.why,
        itemIds: plan.itemIds,
        occasion,
        weather: { tempC, label: weather?.label ?? "Seasonal estimate" },
      }),
    );
    if (reroll) await allowance.countReroll();
    track("outfit_made", { source: plan.source, occasion, reroll });
    setBusy(false);
  }

  // Picking another occasion rebuilds today's outfit for it.
  const pendingOccasion = useRef(false);
  useEffect(() => {
    if (!pendingOccasion.current) return;
    pendingOccasion.current = false;
    void makeOutfit(false);
    // Runs when the occasion changes; makeOutfit reads the latest state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [occasion]);

  // The first outfit of the day appears by itself once the closet and weather are in.
  const started = useRef(false);
  useEffect(() => {
    if (started.current || items.loading || looks.loading || !weatherReady) return;
    if (!current && closetReady) {
      started.current = true;
      void makeOutfit(false);
    }
    // makeOutfit reads the latest state when it runs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.loading, looks.loading, weatherReady, current, closetReady]);

  async function wearIt() {
    if (!current || current.worn) return;
    await looks.update(current.id, { worn: true, saved: true });
    for (const item of outfitItems)
      await items.update(item.id, { wornCount: item.wornCount + 1, lastWornOn: today });
    const result = await habit.complete();
    track("outfit_worn", { occasion: current.occasion ?? "everyday", streak: result.streak });
    if (result.first || result.milestone) setCelebrate((n) => n + 1);
  }

  async function toggleSave() {
    if (!current) return;
    await looks.update(current.id, { saved: !current.saved });
  }

  const boardWidth = width - theme.spacing.lg * 2 - theme.spacing.md * 2;
  const loading = items.loading || looks.loading;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.xl * 2,
          gap: theme.spacing.lg,
        }}
      >
        <Stagger step={60} style={{ gap: theme.spacing.lg }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "flex-start",
              justifyContent: "space-between",
            }}
          >
            <View style={{ gap: 4, flex: 1 }}>
              <Eyebrow>
                {now.toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "short",
                  day: "numeric",
                })}
              </Eyebrow>
              <Display>{greeting(now)}</Display>
            </View>
            <IconButton
              icon="settings-outline"
              label="Settings"
              onPress={() => router.push("/settings")}
            />
          </View>

          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            <StatusPill
              icon={(weather?.icon as keyof typeof Ionicons.glyphMap) ?? "partly-sunny-outline"}
              text={
                weather
                  ? `${formatTemp(weather.tempC, profile.unit)} ${weather.label}${
                      profile.place?.name ? ` · ${profile.place.name.split(",")[0]}` : ""
                    }`
                  : profile.place
                    ? "Weather unavailable · using the season"
                    : "Set your city for the weather"
              }
              onPress={profile.place && weather ? undefined : () => router.push("/settings")}
            />
            {weather && weather.rainChance >= 30 ? (
              <StatusPill
                icon="umbrella-outline"
                text={`${Math.round(weather.rainChance)}% rain`}
              />
            ) : null}
            {habit.streak > 0 ? (
              <StatusPill icon="flame-outline" text={`${habit.streak}-day streak`} />
            ) : null}
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: theme.spacing.sm }}
          >
            {OCCASIONS.map((o) => (
              <Chip
                key={o.id}
                role="radio"
                label={o.label}
                selected={occasion === o.id}
                onPress={() => {
                  if (o.id === occasion) return;
                  setOccasion(o.id);
                  // A new occasion gets its own outfit (it doesn't use up a free option).
                  if (current && !current.worn) pendingOccasion.current = true;
                }}
              />
            ))}
          </ScrollView>

          {loading ? (
            <Card style={{ gap: theme.spacing.md }}>
              <Skeleton width={140} height={14} />
              <Skeleton width={220} height={28} />
              <Skeleton width={boardWidth} height={boardWidth / 2} />
            </Card>
          ) : !closetReady ? (
            <EmptyCloset count={items.items.length} />
          ) : (
            <Card style={{ gap: theme.spacing.md, padding: theme.spacing.md }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                }}
              >
                <Eyebrow>{current?.worn ? "Wearing today" : "Today's outfit"}</Eyebrow>
                {current ? (
                  <IconButton
                    icon={current.saved ? "heart" : "heart-outline"}
                    label={current.saved ? "Remove from saved looks" : "Save this look"}
                    onPress={() => void toggleSave()}
                  />
                ) : null}
              </View>
              {busy || !current ? (
                <View style={{ gap: theme.spacing.md }}>
                  <Skeleton width={220} height={28} />
                  <Skeleton width={boardWidth} height={boardWidth / 2} />
                  <Body muted>Putting today's outfit together…</Body>
                </View>
              ) : (
                <Appear key={current.id} style={{ gap: theme.spacing.md }}>
                  <Display size="headline">{current.title}</Display>
                  <OutfitBoard items={outfitItems} width={boardWidth} />
                  {current.note ? <Body>{current.note}</Body> : null}
                  {current.worn ? (
                    <View
                      style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}
                    >
                      <Ionicons name="checkmark-circle" size={22} color={theme.colors.success} />
                      <Body style={{ flex: 1 }}>
                        Logged.{" "}
                        {habit.streak > 1
                          ? `${habit.streak} days dressed with a plan.`
                          : "Tomorrow's outfit is ready in the morning."}
                      </Body>
                    </View>
                  ) : (
                    <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                      <Button
                        label="Wear this"
                        icon="checkmark"
                        onPress={() => void wearIt()}
                        style={{ flex: 1 }}
                      />
                      <Button
                        label="Another option"
                        kind="outline"
                        onPress={() => void makeOutfit(true)}
                        style={{ flex: 1 }}
                      />
                    </View>
                  )}
                  {!current.worn && !allowance.isPremium ? (
                    <Text
                      style={{
                        fontSize: theme.font.size.caption + 1,
                        color: theme.colors.textMuted,
                      }}
                    >
                      {allowance.rerollsLeft > 0
                        ? `${allowance.rerollsLeft} more option${allowance.rerollsLeft === 1 ? "" : "s"} today on the free plan.`
                        : "Premium gives you a new option whenever you want one."}
                    </Text>
                  ) : null}
                </Appear>
              )}
              {notice ? <Body muted>{notice}</Body> : null}
            </Card>
          )}

          <WeekStrip week={habit.week} />

          <View style={{ gap: theme.spacing.sm }}>
            <Eyebrow>Saw a look you love?</Eyebrow>
            <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
              <ToolCard
                icon="scan-outline"
                title="Shop the look"
                detail="Find each piece, and what you already own"
                onPress={() => router.push("/scan")}
              />
              <ToolCard
                icon="star-outline"
                title="Rate my fit"
                detail="A score and two fixes from your closet"
                onPress={() => router.push({ pathname: "/scan", params: { mode: "rate" } })}
              />
            </View>
          </View>
        </Stagger>
      </ScrollView>
      <Celebrate trigger={celebrate} />
    </View>
  );
}

function StatusPill({
  icon,
  text,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  text: string;
  onPress?: () => void;
}) {
  const theme = useTheme();
  const body = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 36,
        paddingHorizontal: theme.spacing.md,
        borderRadius: theme.radius.pill,
        backgroundColor: theme.colors.surfaceAlt,
      }}
    >
      <Ionicons name={icon} size={16} color={theme.colors.text} />
      <Text
        style={{
          fontSize: theme.font.size.caption + 2,
          color: theme.colors.text,
          fontWeight: theme.font.weight.medium,
        }}
      >
        {text}
      </Text>
    </View>
  );
  if (!onPress) return body;
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={text}
      scaleTo={0.95}
    >
      {body}
    </PressScale>
  );
}

function EmptyCloset({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <Card style={{ gap: theme.spacing.md, padding: theme.spacing.lg }}>
      <Eyebrow>Your first outfit</Eyebrow>
      <Display size="headline">
        {count === 0 ? "Start with what's in your closet" : "A few more pieces and you're set"}
      </Display>
      <Body muted>
        Outfits need a top and a bottom (or a dress) and some shoes. Tap the basics you own: it
        takes a minute, and you can add photos any time.
      </Body>
      <Button label="Tap the basics I own" onPress={() => router.push("/basics")} />
      <Button
        label="Add a piece with a photo"
        kind="outline"
        icon="camera-outline"
        onPress={() => router.push("/add-item")}
      />
    </Card>
  );
}

function WeekStrip({ week }: { week: { date: string; done: boolean; today: boolean }[] }) {
  const theme = useTheme();
  if (!week.length) return null;
  return (
    <View style={{ gap: theme.spacing.sm }}>
      <Eyebrow>This week</Eyebrow>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        {week.map((d) => {
          const [y, m, day] = d.date.split("-").map(Number);
          const label = new Date(y!, m! - 1, day!).toLocaleDateString(undefined, {
            weekday: "narrow",
          });
          return (
            <View
              key={d.date}
              accessible
              accessibilityLabel={`${d.date}: ${d.done ? "dressed with a plan" : "no outfit logged"}`}
              style={{ alignItems: "center", gap: 6 }}
            >
              <Text style={{ fontSize: theme.font.size.caption, color: theme.colors.textMuted }}>
                {label}
              </Text>
              <View
                style={{
                  width: 34,
                  height: 34,
                  borderRadius: 17,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: d.done ? theme.colors.primary : theme.colors.surface,
                  borderWidth: d.today ? 1.5 : 1,
                  borderColor: d.today ? theme.colors.text : theme.colors.border,
                }}
              >
                {d.done ? (
                  <Ionicons name="checkmark" size={16} color={theme.colors.onPrimary} />
                ) : null}
              </View>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function ToolCard({
  icon,
  title,
  detail,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  detail: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <PressScale
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${detail}`}
      style={{ flex: 1 }}
    >
      <Card style={{ gap: theme.spacing.sm, minHeight: 140 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: theme.radius.sm,
            backgroundColor: theme.colors.surfaceAlt,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name={icon} size={20} color={theme.colors.text} />
        </View>
        <Text
          style={{
            fontSize: theme.font.size.body,
            fontWeight: theme.font.weight.bold,
            color: theme.colors.text,
          }}
        >
          {title}
        </Text>
        <Text style={{ fontSize: theme.font.size.caption + 1, color: theme.colors.textMuted }}>
          {detail}
        </Text>
      </Card>
    </PressScale>
  );
}
