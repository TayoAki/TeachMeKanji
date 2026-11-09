/**
 * Spike B finding, reproducible: which Expo SDKs have a published Snack runtime?
 *
 * Snack runs projects inside Expo Go by loading a "Snack runtime" published as an EAS Update
 * (runtime version `exposdk:<sdk>`). Store builds of Expo Go only run the latest SDK, so if
 * the latest SDK has no Snack runtime, a Snack QR code cannot open on a current phone.
 *
 *   npm run spike:snack-check
 */
import { pathToFileURL } from "node:url";

// The EAS project that hosts the Snack runtime (snack-content's SNACK_RUNTIME_URL_ENDPOINT).
const SNACK_RUNTIME = "https://u.expo.dev/933fd9c0-1666-11e7-afca-d980795c5824";

export async function hasSnackRuntime(sdk: string, platform: "ios" | "android"): Promise<boolean> {
  const runtimeVersion = `exposdk:${sdk}`;
  const response = await fetch(
    `${SNACK_RUNTIME}?runtime-version=${runtimeVersion}&channel-name=production`,
    {
      headers: {
        "expo-platform": platform,
        "expo-runtime-version": runtimeVersion,
        "expo-channel-name": "production",
        "expo-protocol-version": "1",
        accept: "multipart/mixed,application/expo+json,application/json",
      },
    },
  );
  // 200 + manifest = runtime exists; 204 = no update published for this runtime version.
  return response.status === 200;
}

export async function latestSdks(count = 6): Promise<string[]> {
  const response = await fetch("https://api.expo.dev/v2/versions/latest");
  const body = (await response.json()) as { data: { sdkVersions: Record<string, unknown> } };
  return Object.keys(body.data.sdkVersions)
    .sort((a, b) => parseFloat(b) - parseFloat(a))
    .slice(0, count);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  for (const sdk of await latestSdks()) {
    const [ios, android] = await Promise.all([
      hasSnackRuntime(sdk, "ios"),
      hasSnackRuntime(sdk, "android"),
    ]);
    console.log(
      `SDK ${sdk.padEnd(8)} snack runtime  ios: ${ios ? "yes" : "NO "}  android: ${android ? "yes" : "NO"}`,
    );
  }
}
