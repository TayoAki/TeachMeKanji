// Premium: the annual plan with a 3-day trial is selected; the price after the trial is stated
// plainly, with a timeline, and the paywall closes like any screen.
import { Ionicons } from "@expo/vector-icons";
import { useState } from "react";
import { Linking, ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Lottie } from "../components/lottie";
import { PressScale, Pulse, Stagger } from "../components/motion";
import { Body, Button, Display, Eyebrow, IconButton } from "../components/ui";
import { appInfo } from "../data/app-info";
import { usePurchases, type Offer } from "../data/purchases";
import { useTheme } from "../theme/ThemeProvider";

const PER: Record<Offer["period"], string> = {
  week: "week",
  month: "month",
  year: "year",
  lifetime: "",
};

function trialEnd(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toLocaleDateString(undefined, { month: "long", day: "numeric" });
}

export default function Paywall() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const {
    offers,
    defaultOfferId,
    premiumFeatures,
    status,
    error,
    testMode,
    purchase,
    restorePurchases,
    dismissPaywall,
  } = usePurchases();
  const [selected, setSelected] = useState(defaultOfferId);
  const offer = offers.find((o) => o.id === selected) ?? offers[0];
  const trial = offer && offer.trialDays > 0 ? offer.trialDays : 0;

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{
          paddingTop: insets.top + theme.spacing.md,
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: theme.spacing.lg,
          gap: theme.spacing.lg,
        }}
      >
        <View style={{ flexDirection: "row", justifyContent: "flex-end" }}>
          <IconButton icon="close" label="Close" onPress={dismissPaywall} />
        </View>
        <Stagger step={60} style={{ gap: theme.spacing.lg }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: theme.spacing.sm }}>
            <Lottie name="sparkle" size={44} />
            <Eyebrow>Closetcast Premium</Eyebrow>
          </View>
          <Display>Your stylist, every morning</Display>
          <View style={{ gap: theme.spacing.sm }}>
            {premiumFeatures.map((feature) => (
              <View
                key={feature}
                style={{ flexDirection: "row", gap: theme.spacing.md, alignItems: "flex-start" }}
              >
                <Ionicons
                  name="checkmark-circle"
                  size={22}
                  color={theme.colors.accent}
                  style={{ marginTop: 1 }}
                />
                <Body style={{ flex: 1 }}>{feature}</Body>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: "row", gap: theme.spacing.sm }}>
            {offers.map((o) => {
              const active = o.id === selected;
              return (
                <PressScale
                  key={o.id}
                  onPress={() => setSelected(o.id)}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  accessibilityLabel={`${o.label}, ${o.price} a ${PER[o.period]}${o.trialDays ? `, ${o.trialDays}-day free trial` : ""}`}
                  style={{ flex: 1 }}
                >
                  <View
                    style={{
                      gap: 4,
                      padding: theme.spacing.md,
                      minHeight: 112,
                      borderRadius: theme.radius.lg,
                      borderWidth: active ? 2 : 1,
                      borderColor: active ? theme.colors.text : theme.colors.border,
                      backgroundColor: active ? theme.colors.surfaceAlt : theme.colors.surface,
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: theme.font.size.body,
                          fontWeight: theme.font.weight.bold,
                          color: theme.colors.text,
                        }}
                      >
                        {o.label}
                      </Text>
                      <Ionicons
                        name={active ? "radio-button-on" : "radio-button-off"}
                        size={20}
                        color={theme.colors.text}
                      />
                    </View>
                    <Text
                      style={{
                        fontSize: theme.font.size.title,
                        color: theme.colors.text,
                        fontVariant: ["tabular-nums"],
                      }}
                    >
                      {o.price}
                      <Text
                        style={{
                          fontSize: theme.font.size.caption + 1,
                          color: theme.colors.textMuted,
                        }}
                      >
                        {" "}
                        / {PER[o.period]}
                      </Text>
                    </Text>
                    <Text
                      style={{
                        fontSize: theme.font.size.caption + 1,
                        color: theme.colors.textMuted,
                      }}
                    >
                      {o.trialDays ? `${o.trialDays} days free` : "No trial"}
                    </Text>
                    {o.badge ? (
                      <View
                        style={{
                          alignSelf: "flex-start",
                          marginTop: 2,
                          paddingHorizontal: theme.spacing.sm,
                          paddingVertical: 3,
                          borderRadius: theme.radius.pill,
                          backgroundColor: theme.colors.accent,
                        }}
                      >
                        <Text
                          style={{
                            fontSize: theme.font.size.caption,
                            fontWeight: theme.font.weight.bold,
                            color: theme.colors.onPrimary,
                          }}
                        >
                          {o.badge}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </PressScale>
              );
            })}
          </View>

          {offer && trial ? (
            <View style={{ gap: theme.spacing.sm }}>
              {[
                ["lock-open-outline", "Today", "Everything in Premium, free"],
                [
                  "notifications-outline",
                  `Day ${Math.max(1, trial - 1)}`,
                  "We remind you before the trial ends",
                ],
                [
                  "card-outline",
                  trialEnd(trial),
                  `${offer.price} a ${PER[offer.period]}, unless you cancel before`,
                ],
              ].map(([icon, when, what]) => (
                <View
                  key={when}
                  style={{ flexDirection: "row", gap: theme.spacing.md, alignItems: "center" }}
                >
                  <Ionicons
                    name={icon as keyof typeof Ionicons.glyphMap}
                    size={20}
                    color={theme.colors.text}
                  />
                  <Text
                    style={{
                      width: 92,
                      fontSize: theme.font.size.body,
                      fontWeight: theme.font.weight.bold,
                      color: theme.colors.text,
                    }}
                  >
                    {when}
                  </Text>
                  <Body muted style={{ flex: 1 }}>
                    {what}
                  </Body>
                </View>
              ))}
            </View>
          ) : null}
        </Stagger>
      </ScrollView>

      <View
        style={{
          paddingHorizontal: theme.spacing.lg,
          paddingBottom: insets.bottom + theme.spacing.md,
          gap: theme.spacing.sm,
        }}
      >
        {error ? (
          <Text style={{ color: theme.colors.danger, fontSize: theme.font.size.body }}>
            {error}
          </Text>
        ) : null}
        <Pulse>
          <Button
            label={
              trial
                ? `Start my ${trial}-day free trial`
                : `Continue with ${offer?.label ?? "Premium"}`
            }
            loading={status === "purchasing"}
            onPress={() => offer && void purchase(offer.id)}
          />
        </Pulse>
        <Text
          style={{
            fontSize: theme.font.size.caption,
            color: theme.colors.textMuted,
            textAlign: "center",
          }}
        >
          {offer
            ? trial
              ? `Free for ${trial} days, then ${offer.price} a ${PER[offer.period]}. Renews automatically until you cancel, at least 24 hours before the period ends, in your App Store or Google Play settings.`
              : `${offer.price} a ${PER[offer.period]}. Renews automatically until you cancel, at least 24 hours before the period ends, in your App Store or Google Play settings.`
            : ""}
          {testMode ? " Test mode: purchases are simulated, nothing is charged." : ""}
        </Text>
        <View
          style={{
            flexDirection: "row",
            justifyContent: "center",
            gap: theme.spacing.md,
            flexWrap: "wrap",
          }}
        >
          <Button
            label={status === "restoring" ? "Restoring…" : "Restore Purchases"}
            kind="text"
            onPress={() => void restorePurchases()}
          />
          {appInfo.termsUrl ? (
            <Button
              label="Terms of Use"
              kind="text"
              onPress={() => void Linking.openURL(appInfo.termsUrl)}
            />
          ) : null}
          {appInfo.privacyUrl ? (
            <Button
              label="Privacy Policy"
              kind="text"
              onPress={() => void Linking.openURL(appInfo.privacyUrl)}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}
