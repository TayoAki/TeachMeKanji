import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { hasErrors, isTemplateFile, validateProject } from "@appbuilder/contract";
import { loadProject } from "@appbuilder/contract/node";
import { createModuleSystem } from "./loader";
import { vendorModules } from "./vendor";

const root = fileURLToPath(new URL("../../../", import.meta.url));
const project = await loadProject(
  join(root, "templates/expo-app"),
  join(root, "fixtures/habit-tracker"),
);

describe("motion kit (template components/motion.tsx)", () => {
  it("is a platform file that loads in the preview with every piece", () => {
    expect(isTemplateFile("components/motion.tsx")).toBe(true);
    const modules = createModuleSystem(project, vendorModules, { instrument: false });
    const kit = modules.require("components/motion.tsx") as Record<string, unknown>;
    for (const name of [
      "Appear",
      "Stagger",
      "PressScale",
      "CountUp",
      "GrowBar",
      "Float",
      "useReducedMotion",
    ])
      expect(typeof kit[name], name).toBe("function");
  });

  it("can be used by a generated screen without breaking the platform's rules", () => {
    const screen = `import { Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { CountUp, Float, GrowBar, PressScale, Stagger } from "../../components/motion";
import { useTheme } from "../../theme/ThemeProvider";

export default function Motion() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1, paddingTop: insets.top, backgroundColor: theme.colors.background }}>
      <Stagger step={60}>
        <Float><Text style={{ color: theme.colors.text }}>Moon</Text></Float>
        <CountUp value={82} style={{ color: theme.colors.text, fontSize: 48 }} />
        <GrowBar progress={0.7} />
        <PressScale onPress={() => {}} accessibilityRole="button" style={{ padding: theme.spacing.md }}>
          <Text style={{ color: theme.colors.text }}>Save night</Text>
        </PressScale>
      </Stagger>
    </View>
  );
}
`;
    const files = { ...project, "app/(tabs)/motion.tsx": screen };
    const issues = validateProject(files).filter((i) => i.path === "app/(tabs)/motion.tsx");
    expect(hasErrors(issues), JSON.stringify(issues)).toBe(false);
  });
});
