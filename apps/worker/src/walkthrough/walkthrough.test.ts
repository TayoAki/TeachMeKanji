import type Anthropic from "@anthropic-ai/sdk";
import { afterAll, describe, expect, it } from "vitest";
import type { CreateMessage } from "../generation/client";
import type { HandlerContext } from "../handlers/context";
import { fixtureProject } from "../project";
import { canRenderScreens, closeRenderer, renderScreens } from "../render/screens";
import { AppSession } from "./app-session";
import {
  CASES_SYSTEM,
  TESTER_SYSTEM,
  failureReport,
  walkthroughApp,
  walkthroughSummary,
  type CaseResult,
} from "./walkthrough";

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

const reply = (value: unknown) =>
  ({
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "scripted",
    content: [{ type: "text", text: JSON.stringify(value), citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 0, output_tokens: 0 },
  }) as unknown as Anthropic.Beta.Messages.BetaMessage;

const lastScreen = (params: Params) => {
  const last = params.messages.at(-1)!;
  return (last.content as Anthropic.Beta.Messages.BetaContentBlockParam[])
    .map((b) => (b.type === "text" ? b.text : ""))
    .join("\n");
};

/** The control number for a name in the screen description the tester gets. */
const refFor = (screen: string, name: RegExp) => {
  const line = screen.split("\n").find((l) => /^\[\d+\]/.test(l) && name.test(l));
  return line ? Number(/^\[(\d+)\]/.exec(line)![1]) : -1;
};

const action = (a: Partial<Record<string, unknown>>) => ({
  thought: "",
  ref: -1,
  text: "",
  direction: "none",
  seconds: 0,
  result: "none",
  observed: "",
  ...a,
});

/**
 * A scripted tester for the habit tracker: add a habit through the app's screens, then, after the
 * app is relaunched, check it's still there.
 */
const scripted: CreateMessage = async (params) => {
  const system = typeof params.system === "string" ? params.system : "";
  if (system === CASES_SYSTEM)
    return reply({
      cases: [
        { title: "Add a habit", goal: "Add a habit called Read 10 pages.", expect: "It's listed." },
        { title: "It's still there", goal: "Reopen the app.", expect: "Read 10 pages is listed." },
      ],
    });
  if (system !== TESTER_SYSTEM) throw new Error("unexpected request");
  const screen = lastScreen(params);
  const first = (params.messages[0]!.content as Array<{ type: string; text?: string }>).find(
    (b) => b.type === "text",
  )!.text!;
  if (first.includes("Test case: It's still there"))
    return reply(
      screen.includes("Read 10 pages")
        ? action({ action: "done", result: "pass", observed: "Listed after relaunch." })
        : action({ action: "done", result: "fail", observed: "Gone after relaunch." }),
    );
  if (screen.includes("Route: /add-habit")) {
    const field = refFor(screen, /textbox/);
    if (!/value="Read 10 pages"/.test(screen))
      return reply(action({ action: "type", ref: field, text: "Read 10 pages" }));
    return reply(action({ action: "tap", ref: refFor(screen, /Save habit/) }));
  }
  if (screen.includes("Read 10 pages"))
    return reply(action({ action: "done", result: "pass", observed: "Listed on Today." }));
  return reply(action({ action: "tap", ref: refFor(screen, /Add habit/) }));
};

const context = (createMessage: CreateMessage) =>
  ({
    createMessage,
    model: "scripted",
    offline: false,
    emit: async () => {},
    overBudget: () => false,
    charge: () => {},
  }) as unknown as HandlerContext;

describe("the walkthrough on a real app", () => {
  afterAll(() => closeRenderer());

  it("lists the controls on screen, and keeps what the app saved when it's relaunched", async ({
    skip,
  }) => {
    if (!(await canRenderScreens())) skip();
    const files = await fixtureProject("habit-tracker");
    const session = await AppSession.open(files);
    try {
      const home = await session.observe();
      expect(home.path).toBe("/");
      expect(home.errors).toEqual([]);
      const add = home.controls.find((c) => c.name === "Add habit");
      expect(add?.role).toBe("button");
      await session.tap(add!.ref);
      const form = await session.observe();
      expect(form.path).toBe("/add-habit");
      const field = form.controls.find((c) => c.role === "textbox")!;
      await session.type(field.ref, "Read 10 pages");
      expect((await session.observe()).controls.find((c) => c.ref === field.ref)?.value).toBe(
        "Read 10 pages",
      );
    } finally {
      await session.close();
    }
  });

  it("uses the app through its screens, case after case, as one person's phone", async ({
    skip,
  }) => {
    if (!(await canRenderScreens())) skip();
    const files = await fixtureProject("habit-tracker");
    const result = await walkthroughApp(context(scripted), {
      plan: {
        appName: "Habit Loop",
        summary: "",
        coreLoop: "",
        onboarding: { steps: [] },
        monetization: { premiumFeatures: [] },
        screens: [],
        collections: [],
      } as never,
      files,
      buildModel: "scripted",
    });
    expect(result?.cases.map((c) => [c.title, c.status])).toEqual([
      ["Add a habit", "pass"],
      ["It's still there", "pass"],
    ]);
    expect(result?.repaired).toBe(false);
  });
});

const PLAN = {
  appName: "Habit Loop",
  summary: "",
  coreLoop: "",
  onboarding: { steps: [] },
  monetization: { premiumFeatures: [] },
  screens: [],
  collections: [],
} as never;

describe("the walkthrough alongside other work", () => {
  afterAll(() => closeRenderer());

  it(
    "lets other runs render while it waits for the model",
    { timeout: 60_000 },
    async ({ skip }) => {
      if (!(await canRenderScreens())) skip();
      const files = await fixtureProject("habit-tracker");
      const slow: CreateMessage = async (params, hooks) => {
        if (params.system === TESTER_SYSTEM) await new Promise((r) => setTimeout(r, 1500));
        return scripted(params, hooks);
      };
      let finished = 0;
      const walk = walkthroughApp(context(slow), {
        plan: PLAN,
        files,
        buildModel: "scripted",
      }).then((result) => {
        finished = Date.now();
        return result;
      });
      // Mid-walkthrough, while it waits on the model, another build renders a screen.
      await new Promise((r) => setTimeout(r, 2500));
      const [shot] = await renderScreens(files, { only: ["app/(tabs)/index.tsx"], settleMs: 100 });
      const rendered = Date.now();
      expect(shot?.png).toBeTruthy();
      expect((await walk)?.cases).toHaveLength(2);
      expect(rendered).toBeLessThan(finished);
    },
  );

  it("runs when only the mockup check is switched off", async ({ skip }) => {
    if (!(await canRenderScreens())) skip();
    const files = await fixtureProject("habit-tracker");
    process.env.MATCH_STEP = "0";
    try {
      const result = await walkthroughApp(context(scripted), {
        plan: PLAN,
        files,
        buildModel: "scripted",
      });
      expect(result?.cases).toHaveLength(2);
    } finally {
      delete process.env.MATCH_STEP;
    }
  });

  it("keeps the cases that ran when a later one can't finish", async ({ skip }) => {
    if (!(await canRenderScreens())) skip();
    const files = await fixtureProject("habit-tracker");
    const crashes: CreateMessage = async (params, hooks) => {
      const first = JSON.stringify(params.messages[0]?.content ?? "");
      if (params.system === TESTER_SYSTEM && first.includes("Test case: It's still there"))
        throw new Error("The browser went away");
      return scripted(params, hooks);
    };
    const result = await walkthroughApp(context(crashes), {
      plan: PLAN,
      files,
      buildModel: "scripted",
    });
    expect(result?.cases.map((c) => [c.title, c.status])).toEqual([["Add a habit", "pass"]]);
    expect(result?.stopped).toMatch(/couldn't finish/);
    expect(walkthroughSummary(result!)).toContain("I tested 1 thing");
  });
});

describe("what the walkthrough reports", () => {
  const cases: CaseResult[] = [
    {
      title: "Add an alarm",
      goal: "Add one.",
      expect: "Listed.",
      status: "pass",
      observed: "Listed.",
      path: "/",
      errors: [],
      steps: 4,
      fixed: true,
    },
    {
      title: "Buy premium",
      goal: "Buy.",
      expect: "Premium.",
      status: "fail",
      observed: "Still says Free Plan after buying.",
      path: "/",
      errors: ["TypeError: x is undefined"],
      steps: 6,
    },
    {
      title: "Sky photo",
      goal: "Take it.",
      expect: "Silenced.",
      status: "blocked",
      observed: "Needs a real camera photo.",
      path: "/mission/1",
      errors: [],
      steps: 2,
    },
  ];

  it("hands the repair exactly what failed, with what the app threw", () => {
    const report = failureReport(cases);
    expect(report).toContain('"Buy premium"');
    expect(report).toContain("Still says Free Plan after buying.");
    expect(report).toContain("TypeError: x is undefined");
    expect(report).not.toContain("Add an alarm");
    expect(report).not.toContain("Sky photo");
  });

  it("tells the owner what works, what was fixed, what doesn't and what needs a phone", () => {
    const text = walkthroughSummary({ files: {}, repaired: true, cases });
    expect(text).toContain("I tested 3 things");
    expect(text).toContain("1 works (I fixed Add an alarm)");
    expect(text).toContain("Still not working: Buy premium");
    expect(text).toContain("Needs a phone to check: Sky photo");
  });
});
