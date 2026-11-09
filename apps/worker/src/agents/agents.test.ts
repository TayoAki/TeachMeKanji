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

  it("builds screens in parallel after the shared layer, reading one warmed cache", async () => {
    const template = await readTree(join(REPO_ROOT, "templates/expo-app"));
    const { plan } = await planApp({
      createMessage: fakeCreateMessage,
      prompt: "Build me an expense tracker with budgets",
      platforms: "both",
      defaultScreens: 4,
      maxScreens: 5,
    });
    let running = 0;
    let maxRunning = 0;
    let screenCalls = 0;
    let firstScreenStreaming = false;
    const timeline: string[] = [];
    const createMessage: typeof fakeCreateMessage = async (params, hooks) => {
      const request = JSON.stringify(params.messages);
      const isScreen = request.includes("Write the screen");
      if (isScreen) {
        screenCalls += 1;
        // Every screen after the first waits until the first one is streaming.
        if (screenCalls > 1) expect(firstScreenStreaming).toBe(true);
      }
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      timeline.push(isScreen ? "screen" : request.includes("Write the theme") ? "theme" : "data");
      await new Promise((resolve) => setTimeout(resolve, 5));
      const response = await fakeCreateMessage(params, {
        onStreamStart: () => {
          if (isScreen && screenCalls === 1) firstScreenStreaming = true;
          hooks?.onStreamStart?.();
        },
      });
      await new Promise((resolve) => setTimeout(resolve, 20));
      running -= 1;
      return response;
    };
    const built = await buildApp({ createMessage, plan, template });
    expect(formatIssues(validateProject(built.files))).toBe("");
    expect(timeline.slice(0, 2).sort()).toEqual(["data", "theme"]);
    expect(screenCalls).toBe(plan.screens.length);
    expect(maxRunning).toBeGreaterThan(1);
  });
});
