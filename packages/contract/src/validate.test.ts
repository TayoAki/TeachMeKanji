import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadProject } from "./node";
import {
  formatIssues,
  hasErrors,
  validateAccountDeletion,
  validateFile,
  validateProject,
} from "./validate";

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

describe("validateAccountDeletion", () => {
  const account = `const auth = useAuth(); auth.signUp(email, password);`;
  it("requires a Delete account action once people can sign up", () => {
    expect(validateAccountDeletion({ "app/settings.tsx": "export default 1;" })).toEqual([]);
    const issues = validateAccountDeletion({ "app/(tabs)/account.tsx": account });
    expect(issues.map((i) => [i.path, i.rule, i.severity])).toEqual([
      ["app/(tabs)/account.tsx", "structure/account-deletion", "error"],
    ]);
    expect(
      validateAccountDeletion({
        "app/(tabs)/account.tsx": account,
        "app/settings.tsx": "onPress={() => auth.deleteAccount()}",
      }),
    ).toEqual([]);
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

  it("rejects require() and dynamic import()", () => {
    const source = `const cp = require("child_process");
      export default function S() { import("fs"); return null; }`;
    expect(rules("app/x.tsx", source)).toEqual(["imports/dynamic", "imports/dynamic"]);
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

  it("rejects path traversal and odd paths from model output", () => {
    const ok = "export default function S() { return null; }";
    for (const bad of [
      "app/../../etc/x.tsx",
      "/app/x.tsx",
      "app//x.tsx",
      "app/./x.tsx",
      "app\\x.tsx",
      "app/x .tsx",
    ]) {
      expect(rules(bad, ok), bad).toEqual(["layout/path"]);
    }
    expect(rules("app/habit/[id].tsx", ok)).toEqual([]);
  });

  it("only rejects files under the generated roots", () => {
    expect(rules("scripts/hack.ts", "export const a = 1;")).toEqual(["layout/root"]);
  });

  it("checks every theme pack defines every color", () => {
    const pack = (colors: string) => `{ id: "a", colors: { ${colors} } }`;
    const full =
      "background: '#000', surface: '#000', surfaceAlt: '#000', border: '#000', text: '#000', textMuted: '#000', primary: '#000', onPrimary: '#000', accent: '#000', success: '#000', warning: '#000', danger: '#000'";
    const five = (first: string) =>
      `export const themes = [${[first, full, full, full, full].map(pack).join(", ")}];`;
    expect(rules("theme/tokens.ts", five(full))).toEqual([]);
    expect(rules("theme/tokens.ts", five("background: '#000'"))).toEqual([
      "theme/missing-color-keys",
    ]);
    expect(rules("theme/tokens.ts", `export const themes = [${pack(full)}];`)).toEqual([
      "theme/pack-count",
    ]);
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

describe("links open a screen", () => {
  // Tidemark's Today linked "/protocols/new" while the screen is app/protocol/[id].tsx: a phone
  // shows "Unmatched route", and nothing else caught it.
  const paths = new Set([
    "app/_layout.tsx",
    "app/(tabs)/_layout.tsx",
    "app/(tabs)/index.tsx",
    "app/(tabs)/protocols.tsx",
    "app/protocol/[id].tsx",
    "app/settings.tsx",
    "app/paywall.tsx",
  ]);
  const check = (source: string, links?: "error" | "warning") =>
    validateFile("app/(tabs)/index.tsx", source, { paths, links }).filter(
      (i) => i.rule === "routes/link",
    );

  it("reports a link no screen opens, as an error when asked and a warning otherwise", () => {
    const source = `import { router } from "expo-router";
export default function Today() {
  return router.push("/protocols/new");
}`;
    const [issue] = check(source, "error");
    expect(issue).toMatchObject({ severity: "error", line: 3 });
    expect(issue!.message).toContain('"/protocols/new"');
    expect(issue!.message).toContain("/protocol/[id]");
    expect(check(source)[0]!.severity).toBe("warning");
  });

  it("accepts links that open a screen, in every form expo-router takes", () => {
    const source = `import { Link, Redirect, router } from "expo-router";
export default function Today({ id, tab }: { id: string; tab: string }) {
  router.push("/protocol/new");
  router.replace("/(tabs)/protocols");
  router.navigate({ pathname: "/protocol/[id]", params: { id } });
  router.push(\`/protocol/\${id}?from=today\`);
  router.push(\`/\${tab}\`);
  router.push(tab);
  router.back();
  const list = ["/a"]; list.push("/nowhere");
  return (
    <>
      <Link href="/settings">Settings</Link>
      <Link href={{ pathname: "/paywall" }}>Premium</Link>
      <Link href="https://example.com">Site</Link>
      <Redirect href="/" />
    </>
  );
}`;
    expect(check(source, "error")).toEqual([]);
  });

  it("reports broken links in Link, Redirect, objects and template literals too", () => {
    const source = `import { Link, Redirect, router } from "expo-router";
export default function Today({ id }: { id: string }) {
  router.navigate({ pathname: "/protocols/[id]", params: { id } });
  router.push(\`/protocols/\${id}\`);
  return (
    <>
      <Link href="/setting">Settings</Link>
      <Redirect href={"/onboard"} />
    </>
  );
}`;
    expect(check(source, "error").map((i) => i.line)).toEqual([3, 4, 7, 8]);
  });

  it("trusts screens that are still being written and apps with a catch-all route", () => {
    const source = `import { router } from "expo-router";
export default function Today() { return router.push("/journal"); }`;
    expect(
      validateFile("app/(tabs)/index.tsx", source, {
        paths,
        routes: new Set([...paths, "app/(tabs)/journal.tsx"]),
        links: "error",
      }).filter((i) => i.rule === "routes/link"),
    ).toEqual([]);
    expect(
      validateFile("app/(tabs)/index.tsx", source, {
        paths: new Set([...paths, "app/[...rest].tsx"]),
        links: "error",
      }).filter((i) => i.rule === "routes/link"),
    ).toEqual([]);
  });
});
