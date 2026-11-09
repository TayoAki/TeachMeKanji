import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildRouteTree, formatIssues, screens, validateProject } from "@appbuilder/contract";
import { readTree } from "@appbuilder/contract/node";
import { fakeCreateMessage } from "../generation/fake-provider";
import { REPO_ROOT } from "../project";
import { buildApp, editApp, planApp } from "./agents";

process.env.FAKE_LLM_DELAY_MS = "0";

describe("agent pipeline (offline provider)", () => {
  it("plans, revises, builds and edits an app that passes the contract", async () => {
    const template = await readTree(join(REPO_ROOT, "templates/expo-app"));

    const first = await planApp({
      createMessage: fakeCreateMessage,
      prompt: "Build me an expense tracker with budgets",
      platforms: "both",
      defaultScreens: 4,
      maxScreens: 5,
    });
    expect(first.plan.appName).toBe("Penny Wise");
    expect(first.plan.screens[0]!.path).toBe("app/(tabs)/index.tsx");
    expect(first.plan.themes).toHaveLength(5);

    const revised = await planApp({
      createMessage: fakeCreateMessage,
      prompt: "Build me an expense tracker with budgets",
      platforms: "both",
      previous: first.plan,
      feedback: "add a settings screen",
      defaultScreens: 4,
      maxScreens: 5,
    });
    expect(revised.plan.screens.map((s) => s.key)).toContain("settings");

    const events: string[] = [];
    const built = await buildApp({
      createMessage: fakeCreateMessage,
      plan: revised.plan,
      template,
      onEvent: (e) => void events.push(e.type),
    });
    expect(formatIssues(validateProject(built.files))).toBe("");
    expect(built.warnings).toEqual([]);
    expect(JSON.parse(built.files["app.json"]!).expo.name).toBe("Penny Wise");
    const routes = screens(buildRouteTree(Object.keys(built.files))).map((s) => s.screen.file);
    for (const s of revised.plan.screens) expect(routes).toContain(s.path);
    expect(events.filter((e) => e === "files").length).toBe(revised.plan.screens.length + 1);

    const edited = await editApp({
      createMessage: fakeCreateMessage,
      files: built.files,
      request: 'change "Expenses" to "Spending"',
      maxScreens: 12,
    });
    expect(edited.changed).toContain("app/(tabs)/index.tsx");
    expect(edited.files["app/(tabs)/index.tsx"]).toContain("Spending");

    const added = await editApp({
      createMessage: fakeCreateMessage,
      files: edited.files,
      request: "add a goals tab",
      maxScreens: 12,
    });
    expect(added.files["app/(tabs)/goals.tsx"]).toBeDefined();
    expect(added.files["app/(tabs)/_layout.tsx"]).toContain('name="goals"');
    expect(formatIssues(validateProject(added.files))).toBe("");

    await expect(
      editApp({
        createMessage: fakeCreateMessage,
        files: built.files,
        request: "add a goals tab",
        maxScreens: 4,
      }),
    ).rejects.toThrow(/allows 4 screens/);
  });
});
