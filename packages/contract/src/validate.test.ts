import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadProject } from "./node";
import { formatIssues, hasErrors, validateFile, validateProject } from "./validate";

const root = fileURLToPath(new URL("../../../", import.meta.url));

describe("validateProject", () => {
  it("accepts the hand-written fixture app", async () => {
    const files = await loadProject(`${root}templates/expo-app`, `${root}fixtures/habit-tracker`);
    const issues = validateProject(files);
    expect(formatIssues(issues)).toBe("");
  });

  it("reports missing required files", () => {
    const issues = validateProject({
      "app/(tabs)/index.tsx": "export default function A() { return null; }",
    });
    expect(issues.filter((i) => i.rule === "project/required-file").map((i) => i.path)).toContain(
      "theme/tokens.ts",
    );
  });
});

describe("validateFile", () => {
  const rules = (path: string, source: string, paths?: string[]) =>
    validateFile(path, source, { paths: paths ? new Set(paths) : undefined }).map((i) => i.rule);

  it("rejects color literals outside theme/tokens.ts", () => {
    const source = `
      import { View, Text } from "react-native";
      export default function S() {
        return <View style={{ backgroundColor: "#fff" }}><Text style={{ color: "red" }} /></View>;
      }`;
    expect(rules("app/(tabs)/index.tsx", source)).toEqual([
      "style/no-color-literal",
      "style/no-color-literal",
    ]);
  });

  it("allows color literals in theme/tokens.ts and the transparent keyword anywhere", () => {
    expect(rules("theme/tokens.ts", `export const c = "#10261D";`)).toEqual([]);
    expect(rules("components/X.tsx", `export const s = { borderColor: "transparent" };`)).toEqual(
      [],
    );
  });

  it("rejects modules and named imports outside the allow-list", () => {
    const source = `
      import axios from "axios";
      import { MaterialIcons } from "@expo/vector-icons";
      export default function S() { return null; }`;
    expect(rules("app/x.tsx", source)).toEqual(["imports/module", "imports/named"]);
  });

  it("keeps AsyncStorage inside the data layer", () => {
    const source = `import AsyncStorage from "@react-native-async-storage/async-storage";
      export default function S() { return null; }`;
    expect(rules("app/x.tsx", source)).toEqual(["imports/data-layer-only"]);
    expect(rules("data/local.ts", source)).toEqual([]);
  });

  it("requires a default export from screens", () => {
    expect(rules("app/x.tsx", `export function S() { return null; }`)).toEqual([
      "screen/default-export",
    ]);
    expect(rules("components/X.tsx", `export function S() { return null; }`)).toEqual([]);
  });

  it("checks that relative imports resolve", () => {
    const source = `import { Card } from "../components/Card"; export default function S() { return null; }`;
    expect(rules("app/x.tsx", source, ["app/x.tsx", "components/Card.tsx"])).toEqual([]);
    expect(rules("app/x.tsx", source, ["app/x.tsx"])).toEqual(["imports/relative"]);
  });

  it("reports syntax errors with a line number", () => {
    const issues = validateFile(
      "app/x.tsx",
      "export default function S() {\n  const x = ;\n  return null;\n}",
    );
    expect(issues[0]?.rule).toBe("syntax");
    expect(issues[0]?.line).toBe(2);
  });

  it("only rejects files under the generated roots", () => {
    expect(rules("scripts/hack.ts", "export const a = 1;")).toEqual(["layout/root"]);
  });

  it("warns (does not fail) on direct fetch in screens", () => {
    const issues = validateFile(
      "app/x.tsx",
      `export default function S() { fetch("/x"); return null; }`,
    );
    expect(issues.map((i) => i.rule)).toEqual(["data/no-direct-fetch"]);
    expect(hasErrors(issues)).toBe(false);
  });
});
