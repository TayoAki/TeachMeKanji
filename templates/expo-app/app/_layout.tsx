// TEMPLATE FILE — owned by the platform, never written by the model.
// Every app has four parts: onboarding (first launch), a paywall, the main app (the tabs and
// their screens) and settings. Until onboarding is completed only onboarding is reachable;
// afterwards it is out of the way, and the paywall opens as a modal over the app.
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { Pressable, Text, View } from "react-native";
import { trackScreen } from "../data/analytics";
import { reportError, setErrorScreen } from "../data/errors";
import { appStructure } from "../data/app-structure";
import { useAppState } from "../data/app-state";
import { DataProvider } from "../data/repo";
import { ThemeProvider, useTheme } from "../theme/ThemeProvider";

function RootStack() {
  const theme = useTheme();
  const { ready, onboarded } = useAppState();
  const pathname = usePathname();
  // Screen views for the owner's analytics (does nothing while analytics is off), and the
  // screen an error report names.
  useEffect(() => {
    trackScreen(pathname);
    setErrorScreen(pathname);
  }, [pathname]);
  // Render nothing until first-launch state has loaded, so the app never flashes before onboarding.
  if (!ready) return null;
  const showApp = onboarded || !appStructure.onboarding;
  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
          headerShadowVisible: false,
          headerBackButtonDisplayMode: "minimal",
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        {appStructure.onboarding ? (
          <Stack.Protected guard={!showApp}>
            <Stack.Screen
              name="onboarding"
              options={{ headerShown: false, gestureEnabled: false }}
            />
          </Stack.Protected>
        ) : null}
        <Stack.Protected guard={showApp}>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {appStructure.paywall ? (
            <Stack.Screen name="paywall" options={{ presentation: "modal", headerShown: false }} />
          ) : null}
          {appStructure.settings ? (
            <Stack.Screen name="settings" options={{ title: "Settings" }} />
          ) : null}
        </Stack.Protected>
      </Stack>
    </>
  );
}

function ErrorScreen({ retry }: { retry: () => Promise<void> }) {
  const theme = useTheme();
  return (
    <View
      style={{
        flex: 1,
        alignItems: "center",
        justifyContent: "center",
        padding: theme.spacing.xl,
        gap: theme.spacing.md,
        backgroundColor: theme.colors.background,
      }}
    >
      <Text
        style={{
          fontSize: theme.font.size.title,
          fontWeight: theme.font.weight.bold,
          color: theme.colors.text,
        }}
      >
        Something went wrong
      </Text>
      <Text
        style={{
          fontSize: theme.font.size.body,
          textAlign: "center",
          color: theme.colors.textMuted,
        }}
      >
        This screen ran into a problem. It has been reported, and trying again usually helps.
      </Text>
      <Pressable
        onPress={() => void retry()}
        accessibilityRole="button"
        style={({ pressed }) => ({
          marginTop: theme.spacing.sm,
          paddingHorizontal: theme.spacing.lg,
          paddingVertical: theme.spacing.md,
          borderRadius: theme.radius.md,
          backgroundColor: theme.colors.primary,
          opacity: pressed ? 0.8 : 1,
        })}
      >
        <Text
          style={{
            fontSize: theme.font.size.body,
            fontWeight: theme.font.weight.bold,
            color: theme.colors.onPrimary,
          }}
        >
          Try again
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * When a screen throws, people see this instead of a blank app, and the error reaches the app's
 * builder (data/errors).
 */
export function ErrorBoundary({ error, retry }: { error: Error; retry: () => Promise<void> }) {
  useEffect(() => reportError(error), [error]);
  return (
    <ThemeProvider>
      <ErrorScreen retry={retry} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <ThemeProvider>
      <DataProvider>
        <RootStack />
      </DataProvider>
    </ThemeProvider>
  );
}
