// TEMPLATE FILE — owned by the platform, never written by the model.
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { DataProvider } from "../data/repo";
import { ThemeProvider, useTheme } from "../theme/ThemeProvider";

function RootStack() {
  const theme = useTheme();
  return (
    <>
      <StatusBar style={theme.dark ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: theme.colors.surface },
          headerTintColor: theme.colors.text,
          headerShadowVisible: false,
          contentStyle: { backgroundColor: theme.colors.background },
        }}
      >
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
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
