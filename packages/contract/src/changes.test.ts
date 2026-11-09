import { describe, expect, it } from "vitest";
import { applyChanges } from "./changes";
import { readTree, loadProject } from "./node";

const root = new URL("../../../", import.meta.url).pathname;

async function setup() {
  const template = await readTree(`${root}templates/expo-app`);
  const files = await loadProject(`${root}templates/expo-app`, `${root}fixtures/habit-tracker`);
  return { template, files };
}

const SCREEN = `import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export default function About() {
  const theme = useTheme();
  return (
    <View style={{ padding: theme.spacing.md }}>
      <Text style={{ color: theme.colors.text }}>About</Text>
    </View>
  );
}
`;

describe("applyChanges", () => {
  it("accepts a valid new screen and reports what changed", async () => {
    const { template, files } = await setup();
    const result = applyChanges(
      files,
      template,
      { write: { "app/about.tsx": SCREEN } },
      { maxScreens: 12 },
    );
    expect(result.ok).toBe(true);
    expect(result.changed).toEqual(["app/about.tsx"]);
    expect(result.files["app/about.tsx"]).toBe(SCREEN);
  });

  it("refuses platform files, unsafe paths and other roots, and keeps required files", async () => {
    const { template, files } = await setup();
    const result = applyChanges(
      files,
      template,
      {
        write: {
          "data/backend.ts": "export const backend = { apiUrl: 'https://evil.example' };",
          "app/../app.config.ts": "x",
          "scripts/run.ts": "x",
          "theme/types.ts": "x",
        },
        remove: ["data/seed.ts"],
      },
      { maxScreens: 12 },
    );
    expect(result.ok).toBe(false);
    expect(result.rejected.map((r) => r.path).sort()).toEqual(
      [
        "app/../app.config.ts",
        "data/backend.ts",
        "data/seed.ts",
        "scripts/run.ts",
        "theme/types.ts",
      ].sort(),
    );
    expect(result.files["data/backend.ts"]).toBe(
      files["data/backend.ts"] ?? template["data/backend.ts"],
    );
  });

  it("returns the validator's errors for code that breaks the contract", async () => {
    const { template, files } = await setup();
    const bad = SCREEN.replace("theme.colors.text", '"#ff0000"').replace(
      'import { Text, View } from "react-native";',
      'import { Text, View } from "react-native";\nimport axios from "axios";',
    );
    const result = applyChanges(
      files,
      template,
      { write: { "app/about.tsx": bad } },
      { maxScreens: 12 },
    );
    expect(result.ok).toBe(false);
    const rules = result.issues.filter((i) => i.severity === "error").map((i) => i.rule);
    expect(rules.length).toBeGreaterThanOrEqual(2);
  });

  it("enforces the plan's screen limit only when a change adds screens", async () => {
    const { template, files } = await setup();
    const result = applyChanges(
      files,
      template,
      { write: { "app/about.tsx": SCREEN } },
      { maxScreens: 1 },
    );
    expect(result.ok).toBe(false);
    expect(result.rejected[0]?.reason).toMatch(/screens per app/);
  });
});
