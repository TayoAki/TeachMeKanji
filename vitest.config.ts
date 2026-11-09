import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // The preview runtime renders React Native components with react-native-web.
    alias: { "react-native": "react-native-web" },
  },
  test: {
    include: [
      "packages/*/src/**/*.test.ts",
      "apps/worker/src/**/*.test.ts",
      "apps/preview/src/**/*.test.ts",
    ],
    environment: "node",
  },
});
