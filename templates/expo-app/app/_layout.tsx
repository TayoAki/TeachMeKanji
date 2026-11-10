// TEMPLATE FILE — owned by the platform, never written by the model.
// Every app has four parts: onboarding (first launch), a paywall, the main app (the tabs and
// their screens) and settings. Until onboarding is completed only onboarding is reachable;
// afterwards it is out of the way, and the paywall opens as a modal over the app.
import { Stack, usePathname } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { trackScreen } from "../data/analytics";
import { appStructure } from "../data/app-structure";
import { useAppState } from "../data/app-state";
import { DataProvider } from "../data/repo";
import { ThemeProvider, useTheme } from "../theme/ThemeProvider";

function RootStack() {
  const theme = useTheme();
  const { ready, onboarded } = useAppState();
  const pathname = usePathname();
  // Screen views for the owner's analytics (does nothing while analytics is off).
  useEffect(() => trackScreen(pathname), [pathname]);
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

export default function RootLayout() {
  return (
    <ThemeProvider>
      <DataProvider>
        <RootStack />
      </DataProvider>
    </ThemeProvider>
  );
}
