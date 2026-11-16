// First launch: a short style quiz, the weather, the basics they own (no photo needed), their first
// outfit, and the morning outfit notification. Every step is counted, so drop-off shows in analytics.
import { Ionicons } from "@expo/vector-icons";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { GarmentArt } from "../components/GarmentArt";
import { Appear, PageDots, Stagger, StepTransition } from "../components/motion";
import {
  AGE_OPTIONS,
  STYLE_OPTIONS,
  WEAR_OPTIONS,
  savePlace,
  wearCodes,
} from "../components/profile";
import { describeOutfit, isWearable, pickOutfit } from "../components/stylist";
import { Body, Button, Chip, Display, Eyebrow, OutfitBoard, SelectTile } from "../components/ui";
import {
  fetchWeather,
  findCity,
  formatTemp,
  defaultUnit,
  seasonalTempC,
  type Place,
} from "../components/weather";
import { basics } from "../data/content/basics";
import { track } from "../data/analytics";
import { completeOnboarding, setAnswer } from "../data/app-state";
import { useHabit } from "../data/habit";
import { useLocation } from "../data/location";
import { nudges } from "../data/nudges";
import { useCollection } from "../data/repo";
import { newLook, type Item, type Look, type Occasion } from "../data/schema";
import { useTheme } from "../theme/ThemeProvider";

const STEPS = [
  "intro",
  "wear",
  "age",
  "goal",
  "style",
  "weather",
  "basics",
  "outfit",
  "nudges",
] as const;
type Step = (typeof STEPS)[number];

const GOALS = [
  "Get dressed faster",
  "Wear more of what I own",
  "Copy looks I see online",
  "Find my style",
  "Buy fewer, better clothes",
];

export default function Onboarding() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const items = useCollection<Item>("items");
  const looks = useCollection<Look>("looks");
  const habit = useHabit();
  const location = useLocation();

  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [wear, setWear] = useState("");
  const [age, setAge] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [styles, setStyles] = useState<string[]>([]);
  const [place, setPlace] = useState<Place | null>(null);
  const [city, setCity] = useState("");
  const [cityError, setCityError] = useState<string | null>(null);
  const [owned, setOwned] = useState<string[]>([]);
  const [tempC, setTempC] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  const step: Step = STEPS[index]!;
  useEffect(() => {
    track("onboarding_step", { step });
  }, [step]);

  // A location from the permission becomes the place.
  useEffect(() => {
    if (location.place) {
      setPlace({
        latitude: location.place.latitude,
        longitude: location.place.longitude,
        name: location.place.name,
      });
    }
  }, [location.place]);

  function go(delta: 1 | -1) {
    setDirection(delta);
    setIndex((i) => Math.max(0, Math.min(STEPS.length - 1, i + delta)));
  }

  async function answer(question: string, value: string) {
    await setAnswer(question, value);
    track("onboarding_answer", { question, answer: value });
  }

  async function next() {
    if (busy) return;
    if (step === "wear") await answer("wear", wear);
    if (step === "age") await answer("age", age);
    if (step === "goal") await setAnswer("goals", goals.join(","));
    if (step === "style") await setAnswer("styles", styles.join(","));
    if (step === "weather") {
      await savePlace(place);
      await setAnswer("unit", defaultUnit());
      if (place) {
        fetchWeather(place)
          .then((w) => setTempC(w.tempC))
          .catch(() => setTempC(null));
      }
    }
    if (step === "basics") {
      setBusy(true);
      const now = new Date().toISOString();
      for (const id of owned) {
        const basic = basics.find((b) => b.id === id);
        if (!basic || items.items.some((i) => i.name === basic.name)) continue;
        await items.add({
          name: basic.name,
          category: basic.category,
          colors: basic.colors,
          warmth: basic.warmth,
          formality: basic.formality,
          photoUri: null,
          favorite: false,
          wornCount: 0,
          lastWornOn: null,
          createdAt: now,
        });
      }
      track("closet_started", { pieces: owned.length, source: "basics" });
      setBusy(false);
    }
    go(1);
  }

  async function finish(withNudges: boolean) {
    setBusy(true);
    if (withNudges) {
      const on = await habit.enableNudges(nudges);
      track("morning_outfit_nudge", { on });
    }
    // The outfit shown on the last step is today's outfit, so Today opens on the same one.
    if (demo) {
      await looks.add(
        newLook("outfit", {
          title: demo.title,
          note: demo.why,
          itemIds: demo.outfit.map((i) => i.id),
          occasion,
          weather: { tempC: temp, label: tempC === null ? "Seasonal estimate" : "Today's weather" },
        }),
      );
    }
    await completeOnboarding();
  }

  const offered = useMemo(() => basics.filter((b) => wearCodes(wear).includes(b.wear)), [wear]);
  const temp = tempC ?? seasonalTempC(new Date(), place?.latitude);
  const occasion: Occasion = "everyday";
  // The first outfit (shown on the "outfit" step, saved as today's when onboarding finishes).
  const demo = useMemo(() => {
    const outfit = pickOutfit(items.items, {
      tempC: temp,
      rainChance: 0,
      occasion,
      recentIds: new Set(),
      styles,
      wear,
      seed: 7,
    });
    if (!isWearable(outfit)) return null;
    return {
      outfit,
      ...describeOutfit(outfit, {
        tempC: temp,
        rainChance: 0,
        occasion,
        recentIds: new Set(),
        styles,
        wear,
        seed: 7,
      }),
    };
  }, [items.items, temp, occasion, styles, wear]);

  const canContinue =
    (step === "wear" && wear !== "") ||
    (step === "age" && age !== "" && age !== "Under 13") ||
    (step === "goal" && goals.length > 0) ||
    (step === "style" && styles.length > 0) ||
    step === "weather" ||
    step === "basics" ||
    step === "outfit";

  const pad = theme.spacing.lg;
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: theme.colors.background,
        paddingTop: insets.top + theme.spacing.sm,
      }}
    >
      <View
        style={{ height: 44, flexDirection: "row", alignItems: "center", paddingHorizontal: pad }}
      >
        {index > 0 ? (
          <Text
            onPress={() => go(-1)}
            accessibilityRole="button"
            accessibilityLabel="Back"
            style={{
              fontSize: theme.font.size.body,
              color: theme.colors.textMuted,
              paddingVertical: 10,
              paddingRight: 16,
            }}
          >
            Back
          </Text>
        ) : null}
        <View style={{ flex: 1 }} />
        {index > 0 ? <PageDots count={STEPS.length - 1} index={index - 1} /> : null}
      </View>
      <ScrollView
        contentContainerStyle={{
          padding: pad,
          paddingBottom: theme.spacing.xl,
          gap: theme.spacing.lg,
          flexGrow: 1,
        }}
      >
        <StepTransition step={index} direction={direction}>
          <View style={{ gap: theme.spacing.lg }}>
            {step === "intro" ? (
              <Stagger step={80} style={{ gap: theme.spacing.lg }}>
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "center",
                    alignItems: "flex-end",
                    gap: theme.spacing.sm,
                    paddingVertical: theme.spacing.md,
                  }}
                >
                  <GarmentArt category="outerwear" colors={["camel"]} size={110} />
                  <GarmentArt category="top" colors={["cream"]} size={90} />
                  <GarmentArt category="bottom" colors={["denim"]} size={100} />
                  <GarmentArt category="shoes" colors={["white"]} size={70} />
                </View>
                <Display>Your closet, styled for today's weather</Display>
                <Body muted>
                  Every morning Closetcast puts an outfit together from clothes you already own. See
                  a look online? Scan it to find what you already have, and where to get the rest.
                </Body>
                {[
                  ["sunny-outline", "An outfit for the real weather and your plans"],
                  ["scan-outline", "Shop any look: what you own first, then links"],
                  ["star-outline", "Rate your fit, with swaps from your closet"],
                ].map(([icon, text]) => (
                  <View
                    key={text}
                    style={{ flexDirection: "row", gap: theme.spacing.md, alignItems: "center" }}
                  >
                    <Ionicons
                      name={icon as keyof typeof Ionicons.glyphMap}
                      size={22}
                      color={theme.colors.accent}
                    />
                    <Body style={{ flex: 1 }}>{text}</Body>
                  </View>
                ))}
              </Stagger>
            ) : null}

            {step === "wear" ? (
              <Question
                eyebrow="About you"
                title="What do you usually wear?"
                detail="So outfits and shopping searches fit you."
              >
                {WEAR_OPTIONS.map((o) => (
                  <Chip
                    key={o.id}
                    role="radio"
                    label={o.label}
                    selected={wear === o.id}
                    onPress={() => setWear(o.id)}
                  />
                ))}
              </Question>
            ) : null}

            {step === "age" ? (
              <Question
                eyebrow="About you"
                title="How old are you?"
                detail="It shapes the styles we suggest. We don't share it."
              >
                {AGE_OPTIONS.map((o) => (
                  <Chip
                    key={o}
                    role="radio"
                    label={o}
                    selected={age === o}
                    onPress={() => setAge(o)}
                  />
                ))}
                {age === "Under 13" ? (
                  <Body muted style={{ width: "100%" }}>
                    Closetcast is for ages 13 and up. Thanks for stopping by.
                  </Body>
                ) : null}
              </Question>
            ) : null}

            {step === "goal" ? (
              <Question
                eyebrow="Your goals"
                title="What would help most?"
                detail="Pick any that fit."
              >
                {GOALS.map((g) => (
                  <Chip
                    key={g}
                    label={g}
                    selected={goals.includes(g)}
                    onPress={() =>
                      setGoals((all) =>
                        all.includes(g) ? all.filter((x) => x !== g) : [...all, g],
                      )
                    }
                  />
                ))}
              </Question>
            ) : null}

            {step === "style" ? (
              <Question
                eyebrow="Your style"
                title="Which styles feel like you?"
                detail="Pick up to three. You can change them in Settings."
              >
                {STYLE_OPTIONS.map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    selected={styles.includes(s)}
                    onPress={() =>
                      setStyles((all) =>
                        all.includes(s) ? all.filter((x) => x !== s) : [...all, s].slice(-3),
                      )
                    }
                  />
                ))}
              </Question>
            ) : null}

            {step === "weather" ? (
              <View style={{ gap: theme.spacing.md }}>
                <Eyebrow>Weather</Eyebrow>
                <Display size="headline">Dress for the day you'll actually have</Display>
                <Body muted>
                  Outfits use today's temperature and chance of rain where you are. Your location
                  stays on your phone; only the city's weather is looked up.
                </Body>
                {place ? (
                  <View
                    style={{ flexDirection: "row", gap: theme.spacing.sm, alignItems: "center" }}
                  >
                    <Ionicons name="location" size={20} color={theme.colors.success} />
                    <Body style={{ flex: 1 }}>{place.name || "Your location is set"}</Body>
                  </View>
                ) : (
                  <>
                    <Button
                      label="Use my location"
                      icon="navigate-outline"
                      loading={location.loading}
                      onPress={() =>
                        void location.request().then((ok) => {
                          if (!ok) setCityError("No problem: type your city instead.");
                        })
                      }
                    />
                    <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                      <TextInput
                        value={city}
                        onChangeText={setCity}
                        placeholder="Or type your city"
                        placeholderTextColor={theme.colors.textMuted}
                        accessibilityLabel="City"
                        returnKeyType="search"
                        style={{
                          flex: 1,
                          minHeight: 52,
                          borderRadius: theme.radius.pill,
                          borderWidth: 1,
                          borderColor: theme.colors.border,
                          backgroundColor: theme.colors.surface,
                          paddingHorizontal: theme.spacing.md,
                          fontSize: theme.font.size.body,
                          color: theme.colors.text,
                        }}
                      />
                      <Button
                        label="Find"
                        kind="outline"
                        onPress={() =>
                          void findCity(city)
                            .then((found) => {
                              setPlace(found);
                              setCityError(
                                found ? null : "We couldn't find that city. Check the spelling.",
                              );
                            })
                            .catch(() =>
                              setCityError("Couldn't look that up. Check your connection."),
                            )
                        }
                      />
                    </View>
                  </>
                )}
                {cityError ? <Body muted>{cityError}</Body> : null}
              </View>
            ) : null}

            {step === "basics" ? (
              <View style={{ gap: theme.spacing.md }}>
                <Eyebrow>Your closet</Eyebrow>
                <Display size="headline">Tap the basics you own</Display>
                <Body muted>
                  No photos needed now. Add photos of your own pieces any time from Closet.
                </Body>
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
                  {offered.map((b, i) => (
                    <Appear key={b.id} delay={Math.min(i, 8) * 40}>
                      <SelectTile
                        label={b.name}
                        selected={owned.includes(b.id)}
                        width={Math.floor((width - pad * 2 - theme.spacing.sm * 2) / 3)}
                        onPress={() =>
                          setOwned((all) =>
                            all.includes(b.id) ? all.filter((x) => x !== b.id) : [...all, b.id],
                          )
                        }
                      >
                        <GarmentArt
                          category={b.category}
                          colors={b.colors}
                          name={b.name}
                          size={64}
                        />
                      </SelectTile>
                    </Appear>
                  ))}
                </View>
              </View>
            ) : null}

            {step === "outfit" ? (
              <View style={{ gap: theme.spacing.md }}>
                <Eyebrow>
                  Your first outfit · {formatTemp(temp, defaultUnit())}
                  {tempC === null ? " typical for now" : ""}
                </Eyebrow>
                {demo ? (
                  <>
                    <Display size="headline">{demo.title}</Display>
                    <OutfitBoard items={demo.outfit} width={width - pad * 2} />
                    <Body>{demo.why}</Body>
                    <Body muted>Tomorrow there's a new one, picked for tomorrow's weather.</Body>
                  </>
                ) : (
                  <>
                    <Display size="headline">Almost there</Display>
                    <Body muted>
                      Outfits need a top and a bottom (or a dress) and some shoes. Go back and tap a
                      few more, or add them later from Closet: your first outfit appears on Today as
                      soon as they're in.
                    </Body>
                  </>
                )}
              </View>
            ) : null}

            {step === "nudges" ? (
              <View style={{ gap: theme.spacing.md }}>
                <Eyebrow>Every morning</Eyebrow>
                <Display size="headline">Get your outfit before you get dressed</Display>
                <Body muted>
                  One notification at {nudges.carrot.hour}:
                  {String(nudges.carrot.minute).padStart(2, "0")} with today's outfit, and a short
                  note in the evening only if you haven't planned the day. Change the time or turn
                  it off in Settings.
                </Body>
              </View>
            ) : null}
          </View>
        </StepTransition>
      </ScrollView>
      <View
        style={{
          padding: pad,
          paddingBottom: insets.bottom + theme.spacing.md,
          gap: theme.spacing.sm,
        }}
      >
        {step === "intro" ? (
          <Button label="Get started" onPress={() => go(1)} />
        ) : step === "nudges" ? (
          <>
            <Button
              label="Send my morning outfit"
              icon="notifications-outline"
              loading={busy}
              onPress={() => void finish(true)}
            />
            <Button label="Not now" kind="text" onPress={() => void finish(false)} />
          </>
        ) : (
          <>
            <Button
              label={
                step === "basics"
                  ? owned.length
                    ? `Add ${owned.length} piece${owned.length === 1 ? "" : "s"}`
                    : "Skip for now"
                  : step === "weather" && !place
                    ? "Skip for now"
                    : "Continue"
              }
              disabled={!canContinue}
              loading={busy}
              onPress={() => void next()}
            />
          </>
        )}
      </View>
    </View>
  );
}

function Question({
  eyebrow,
  title,
  detail,
  children,
}: {
  eyebrow: string;
  title: string;
  detail: string;
  children: ReactNode;
}) {
  const theme = useTheme();
  return (
    <View style={{ gap: theme.spacing.md }}>
      <Eyebrow>{eyebrow}</Eyebrow>
      <Display size="headline">{title}</Display>
      <Body muted>{detail}</Body>
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
        {children}
      </View>
    </View>
  );
}
