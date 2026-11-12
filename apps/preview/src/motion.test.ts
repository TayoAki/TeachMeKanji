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
      "Mascot",
      "haptic",
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

  it("lets a screen draw with SVG, drag with PanResponder and tap with haptics", () => {
    const screen = `import { useRef } from "react";
import { Animated, PanResponder, View } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, Stop } from "react-native-svg";
import { haptic, PressScale } from "../../components/motion";
import { useTheme } from "../../theme/ThemeProvider";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export default function Ring() {
  const theme = useTheme();
  const x = useRef(new Animated.Value(0)).current;
  const pan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_e, g) => x.setValue(g.dx),
      onPanResponderRelease: () => haptic("selection"),
    }),
  ).current;
  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <Svg width={120} height={120} viewBox="0 0 120 120">
        <Defs>
          <LinearGradient id="g" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={theme.colors.primary} />
            <Stop offset="1" stopColor={theme.colors.accent} />
          </LinearGradient>
        </Defs>
        <Circle cx={60} cy={60} r={50} stroke={theme.colors.surfaceAlt} strokeWidth={10} fill="none" />
        <AnimatedCircle cx={60} cy={60} r={50} stroke="url(#g)" strokeWidth={10} fill="none" strokeDasharray={[314, 314]} />
        <Path d="M10 60 Q60 10 110 60" stroke={theme.colors.text} fill="none" />
      </Svg>
      <Animated.View {...pan.panHandlers} style={{ width: 44, height: 44, transform: [{ translateX: x }] }} />
      <PressScale haptic="light" onPress={() => haptic("success")} accessibilityRole="button" style={{ padding: 12 }}>
        <View />
      </PressScale>
    </View>
  );
}
`;
    const files = { ...project, "app/(tabs)/ring.tsx": screen };
    const issues = validateProject(files).filter((i) => i.path === "app/(tabs)/ring.tsx");
    expect(hasErrors(issues), JSON.stringify(issues)).toBe(false);

    // Haptics go through the kit, not the module.
    const direct = {
      ...project,
      "app/(tabs)/buzz.tsx": `import * as Haptics from "expo-haptics";\nimport { View } from "react-native";\nexport default function B() { Haptics.selectionAsync(); return <View />; }\n`,
    };
    const rules = validateProject(direct)
      .filter((i) => i.path === "app/(tabs)/buzz.tsx")
      .map((i) => i.rule);
    expect(rules).toContain("imports/platform-only");
  });
});
