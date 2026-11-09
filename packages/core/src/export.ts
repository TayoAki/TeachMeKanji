import type { ProjectFiles } from "@appbuilder/contract";

/** Files added to every export (zip download, GitHub push, native builds). */
export function exportBundle(appName: string, files: ProjectFiles): ProjectFiles {
  return {
    ...files,
    "README.md": exportReadme(appName),
    ".gitignore":
      "node_modules/\n.expo/\ndist/\nweb-build/\n*.jks\n*.p8\n*.p12\n*.key\n*.mobileprovision\n.env*\n",
    "eas.json":
      JSON.stringify(
        {
          cli: { version: ">= 16.0.0", appVersionSource: "remote" },
          build: {
            preview: { distribution: "internal", android: { buildType: "apk" } },
            production: { autoIncrement: true },
          },
          submit: { production: {} },
        },
        null,
        2,
      ) + "\n",
  };
}

export function exportReadme(appName: string): string {
  return `# ${appName}

Built with App Builder: an Expo (React Native) app using Expo Router.

## Run it

\`\`\`bash
npm install
\`\`\`

\`\`\`bash
npx expo start
\`\`\`

Scan the QR code with Expo Go on your phone (same Wi-Fi), or press \`w\` for the web.

## Build for the stores

\`\`\`bash
npx eas-cli build --platform android --profile preview
\`\`\`

\`preview\` makes an installable APK; \`production\` makes an AAB (Android) or IPA (iOS, needs an
Apple Developer account).

## Project layout

- \`app/\` screens (file-based routes; \`app/(tabs)\` are the tabs)
- \`components/\` shared UI
- \`theme/\` five theme packs (\`theme/tokens.ts\`) and the theme provider
- \`data/\` data types, seed data and the storage layer (\`useCollection\`)
`;
}
