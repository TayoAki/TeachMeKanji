// Settings: your style and city, the morning outfit, appearance, help and your data.
import { Stack } from "expo-router";
import { useEffect, useState } from "react";
import { Linking, ScrollView, Switch, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { savePlace, STYLE_OPTIONS, useProfile, WEAR_OPTIONS } from "../components/profile";
import { SupportButton } from "../components/support";
import { Body, Button, Card, Chip, Eyebrow, Row } from "../components/ui";
import { findCity } from "../components/weather";
import { appInfo } from "../data/app-info";
import { resetOnboarding, setAnswer } from "../data/app-state";
import { inviteFriends } from "../data/growth";
import { useHabit } from "../data/habit";
import { useLocation } from "../data/location";
import { nudges } from "../data/nudges";
import { forgetPhoto } from "../data/photos";
import { useCollection } from "../data/repo";
import type { Item, Look } from "../data/schema";
import { useAppearance, useTheme } from "../theme/ThemeProvider";

export default function Settings() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const profile = useProfile();
  const habit = useHabit();
  const location = useLocation();
  const [appearance, setAppearance] = useAppearance();
  const items = useCollection<Item>("items");
  const looks = useCollection<Look>("looks");
  const [city, setCity] = useState("");
  const [cityNote, setCityNote] = useState<string | null>(null);
  const [nudgeNote, setNudgeNote] = useState<string | null>(null);
  const [confirmWipe, setConfirmWipe] = useState(false);

  async function useMyLocation() {
    const ok = await location.request();
    if (!ok) {
      setCityNote(
        "Location is off for Closetcast. Type your city instead, or allow it in your phone's Settings.",
      );
      return;
    }
    await location.refresh();
    setCityNote("Using your location for the weather.");
  }

  // A fresh location from the permission replaces the saved place.
  const fresh = location.place;
  useEffect(() => {
    if (fresh)
      void savePlace({ latitude: fresh.latitude, longitude: fresh.longitude, name: fresh.name });
  }, [fresh]);

  async function saveCity() {
    try {
      const found = await findCity(city);
      if (!found) {
        setCityNote("We couldn't find that city. Check the spelling.");
        return;
      }
      await savePlace(found);
      setCity("");
      setCityNote(`Weather now comes from ${found.name}.`);
    } catch {
      setCityNote("Couldn't look that up. Check your connection.");
    }
  }

  async function toggleNudges(on: boolean) {
    if (on) {
      const ok = await habit.enableNudges(nudges);
      setNudgeNote(
        ok ? null : "Notifications are off for Closetcast. Allow them in your phone's Settings.",
      );
    } else {
      await habit.disableNudges();
    }
  }

  async function wipe() {
    for (const look of looks.items) {
      if (look.photoUri) forgetPhoto(look.photoUri);
      await looks.remove(look.id);
    }
    for (const item of items.items) {
      if (item.photoUri) forgetPhoto(item.photoUri);
      await items.remove(item.id);
    }
    setConfirmWipe(false);
  }

  const section = { gap: theme.spacing.sm } as const;
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Stack.Screen options={{ title: "Settings" }} />
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.xl,
          paddingBottom: insets.bottom + theme.spacing.xl,
        }}
      >
        <View style={section}>
          <Eyebrow>What you wear</Eyebrow>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            {WEAR_OPTIONS.map((o) => (
              <Chip
                key={o.id}
                role="radio"
                label={o.label}
                selected={profile.wear === o.id}
                onPress={() => void setAnswer("wear", o.id)}
              />
            ))}
          </View>
        </View>

        <View style={section}>
          <Eyebrow>Your style (up to three)</Eyebrow>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: theme.spacing.sm }}>
            {STYLE_OPTIONS.map((s) => {
              const on = profile.styles.includes(s);
              return (
                <Chip
                  key={s}
                  label={s}
                  selected={on}
                  onPress={() =>
                    void setAnswer(
                      "styles",
                      (on
                        ? profile.styles.filter((x) => x !== s)
                        : [...profile.styles, s].slice(-3)
                      ).join(","),
                    )
                  }
                />
              );
            })}
          </View>
        </View>

        <View style={section}>
          <Eyebrow>Weather</Eyebrow>
          <Body>
            {profile.place
              ? `Weather comes from ${profile.place.name || "your location"}.`
              : "No city set: outfits use the season."}
          </Body>
          <Button
            label="Use my location"
            kind="outline"
            icon="navigate-outline"
            onPress={() => void useMyLocation()}
          />
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <TextInput
              value={city}
              onChangeText={setCity}
              placeholder="Type a city"
              placeholderTextColor={theme.colors.textMuted}
              accessibilityLabel="City"
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
              label="Save"
              kind="outline"
              disabled={city.trim().length < 2}
              onPress={() => void saveCity()}
            />
          </View>
          {cityNote ? <Body muted>{cityNote}</Body> : null}
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            <Chip
              role="radio"
              label="°F"
              selected={profile.unit === "f"}
              onPress={() => void setAnswer("unit", "f")}
            />
            <Chip
              role="radio"
              label="°C"
              selected={profile.unit === "c"}
              onPress={() => void setAnswer("unit", "c")}
            />
          </View>
        </View>

        <View style={section}>
          <Eyebrow>Morning outfit</Eyebrow>
          <Row
            icon="notifications-outline"
            title={`Today's outfit at ${nudges.carrot.hour}:${String(nudges.carrot.minute).padStart(2, "0")}`}
            detail="And a short evening note only if the day isn't planned"
            right={
              <Switch
                value={habit.nudgesOn}
                onValueChange={(on) => void toggleNudges(on)}
                accessibilityLabel="Morning outfit notification"
                trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              />
            }
          />
          {nudgeNote ? <Body muted>{nudgeNote}</Body> : null}
        </View>

        <View style={section}>
          <Eyebrow>Appearance</Eyebrow>
          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            {(["system", "light", "dark"] as const).map((a) => (
              <Chip
                key={a}
                role="radio"
                label={a === "system" ? "Like my phone" : a === "light" ? "Light" : "Dark"}
                selected={appearance === a}
                onPress={() => setAppearance(a)}
              />
            ))}
          </View>
        </View>

        <View style={section}>
          <Eyebrow>Closetcast</Eyebrow>
          <Row
            icon="gift-outline"
            title="Invite friends"
            detail="Swap outfit ideas with someone whose style you like"
            onPress={() =>
              void inviteFriends("I plan my outfits from my own closet with Closetcast. Try it:")
            }
          />
          <Row
            icon="refresh-outline"
            title="Redo the style quiz"
            detail="Change what you wear and your style"
            onPress={() => void resetOnboarding()}
          />
          <SupportButton />
          {appInfo.privacyUrl ? (
            <Row
              icon="lock-closed-outline"
              title="Privacy Policy"
              onPress={() => void Linking.openURL(appInfo.privacyUrl)}
            />
          ) : null}
          {appInfo.termsUrl ? (
            <Row
              icon="document-text-outline"
              title="Terms of Use"
              onPress={() => void Linking.openURL(appInfo.termsUrl)}
            />
          ) : null}
        </View>

        <View style={section}>
          <Eyebrow>Your data</Eyebrow>
          <Body muted>
            Your closet, looks and photos stay on this phone. Photos you scan or rate are sent to
            our AI provider only to answer you, and aren't kept by them.
          </Body>
          {confirmWipe ? (
            <Card style={{ borderColor: theme.colors.danger }}>
              <Body>
                Delete your whole closet, every look and their photos? This can't be undone.
              </Body>
              <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
                <Button
                  label="Delete everything"
                  onPress={() => void wipe()}
                  style={{ flex: 1, backgroundColor: theme.colors.danger }}
                />
                <Button
                  label="Keep it"
                  kind="outline"
                  onPress={() => setConfirmWipe(false)}
                  style={{ flex: 1 }}
                />
              </View>
            </Card>
          ) : (
            <Button
              label="Delete my closet and looks"
              kind="text"
              icon="trash-outline"
              onPress={() => setConfirmWipe(true)}
            />
          )}
          <Text style={{ fontSize: theme.font.size.caption, color: theme.colors.textMuted }}>
            {appInfo.name} {appInfo.version}
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}
