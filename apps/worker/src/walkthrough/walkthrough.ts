/**
 * The walkthrough: before an app reaches its owner, the AI uses it in the web preview the way a
 * person would. It writes test cases from the plan (the things a user does, in the order they
 * meet them), then for each one looks at the screen, taps, types, scrolls and relaunches until it
 * sees the expected result or finds what's broken. Failures are repaired (free: our mistake) and
 * tested again; what the preview can't do (a real camera photo, the microphone) is reported as
 * blocked rather than passed. The app keeps its saved data across cases, like one person's phone.
 */
import type Anthropic from "@anthropic-ai/sdk";
import {
  formatIssues,
  hasErrors,
  validateProject,
  withAppStructure,
  type AppPlan,
  type ProjectFiles,
} from "@appbuilder/contract";
import { codeSystem, filesAsContext } from "../agents/prompts";
import { textOf, type CreateMessage } from "../generation/client";
import { generateFiles } from "../generation/generate-files";
import type { HandlerContext } from "../handlers/context";
import { BudgetExceeded, Cancelled, freeCalls } from "../llm";
import { canRunApps } from "../render/screens";
import { AppSession, type Observation } from "./app-session";

/** The model that writes the cases and uses the app (it reads screenshots). */
export const TEST_MODEL = () => process.env.TEST_MODEL || "claude-haiku-5-5";
const MAX_CASES = 8;
const MAX_STEPS = Number(process.env.WALKTHROUGH_STEPS) || 14;

export interface TestCase {
  title: string;
  goal: string;
  expect: string;
}

export interface CaseResult extends TestCase {
  status: "pass" | "fail" | "blocked";
  observed: string;
  /** The screen it ended on. */
  path: string;
  errors: string[];
  steps: number;
  /** Failed first, passed after the repair. */
  fixed?: boolean;
}

export interface WalkthroughResult {
  files: ProjectFiles;
  /** Changed when a repair was kept. */
  repaired: boolean;
  cases: CaseResult[];
  /** Why it stopped early, if it did. */
  stopped?: string;
}

export const CASES_SYSTEM = `You write test cases for a mobile app before real people use it: the things a person does with it, each checked through the app's own screens.`;

export function casesRequest(plan: AppPlan, routes: string[]): string {
  return `The app's plan:
${JSON.stringify(
  {
    appName: plan.appName,
    summary: plan.summary,
    coreLoop: plan.coreLoop,
    onboarding: plan.onboarding.steps.map((s) => ({ kind: s.kind, title: s.title })),
    monetization: plan.monetization,
    screens: plan.screens.map((s) => ({ title: s.title, route: s.path, purpose: s.purpose })),
    data: plan.collections.map((c) => c.name),
  },
  null,
  1,
)}
Routes in the build: ${routes.join(", ")}

Write ${MAX_CASES - 4} to ${MAX_CASES} test cases in the order a new user meets them. Cover: the first launch and onboarding (when there is one); the core loop end to end (create or do the main thing and see it where it should appear); that what the user saves is still there after leaving the screen and after relaunching the app; the paywall (closing it works, and a purchase in the preview's test mode unlocks what it promises); settings that change the app; and every main screen's main action. Each case:
- title: what the user does, in a few words ("Add an alarm for 6:30 on weekdays").
- goal: what to do, the way a person would follow it through the screens (no code, no routes).
- expect: what must be visible afterwards for it to work.
Add at most 2 cases for what only a real phone can show (a camera photo, the microphone, an alarm or reminder going off while the app is closed): they're reported as needing a phone, never as passing. No cases that need an email inbox or a store purchase.`;
}

const CASES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["cases"],
  properties: {
    cases: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "goal", "expect"],
        properties: {
          title: { type: "string" },
          goal: { type: "string" },
          expect: { type: "string" },
        },
      },
    },
  },
} as const;

export const TESTER_SYSTEM = `You test mobile apps the way a person uses them, in a phone-sized preview of the app. Each turn you get the screen: a screenshot, its route, the controls you can use (numbered) and its text. Reach the goal through the app's own screens: tap controls, type into fields, scroll, wait; never assume something works without seeing it.
Answer with one action at a time:
- tap: ref is the control's number.
- type: ref is a text field's number, text is what to type (it replaces what's there).
- scroll: direction "down" or "up".
- wait: seconds (at most 15), for something due soon (an alarm set a few seconds away, data arriving).
- relaunch: close and reopen the app, to check that something was saved.
- done: result "pass" when you saw the expected result; "fail" when a control did nothing, showed the wrong thing, lost what was saved, crashed, or the goal can't be reached through the app; "blocked" when it needs something the preview can't do (a real camera photo, the microphone, an email inbox, a store purchase). observed says exactly what happened and on which screen, in one or two sentences.
Errors the app threw count as a failure. Purchases in the preview are test purchases: they should unlock what the paywall promises. Fill fields an unused action doesn't need with -1, "" or "none".`;

const ACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["thought", "action", "ref", "text", "direction", "seconds", "result", "observed"],
  properties: {
    thought: { type: "string" },
    action: { type: "string", enum: ["tap", "type", "scroll", "wait", "relaunch", "done"] },
    ref: { type: "integer" },
    text: { type: "string" },
    direction: { type: "string", enum: ["up", "down", "none"] },
    seconds: { type: "number" },
    result: { type: "string", enum: ["pass", "fail", "blocked", "none"] },
    observed: { type: "string" },
  },
} as const;

interface Action {
  action: "tap" | "type" | "scroll" | "wait" | "relaunch" | "done";
  ref: number;
  text: string;
  direction: "up" | "down" | "none";
  seconds: number;
  result: "pass" | "fail" | "blocked" | "none";
  observed: string;
}

function describeScreen(o: Observation, note?: string): string {
  const controls = o.controls
    .map(
      (c) =>
        `[${c.ref}] ${c.role} "${c.name}"${c.value !== undefined ? ` value="${c.value}"` : ""}${
          c.checked !== undefined ? (c.checked ? " (on)" : " (off)") : ""
        }${c.disabled ? " (disabled)" : ""}${c.offscreen ? " (scroll to see)" : ""}`,
    )
    .join("\n");
  return `${note ? `${note}\n` : ""}Route: ${o.path}
Controls:
${controls || "(none)"}
Text on screen: ${o.text || "(none)"}${o.errors.length ? `\nThe app threw: ${o.errors.join(" | ")}` : ""}`;
}

function screenBlocks(
  o: Observation,
  note?: string,
): Anthropic.Beta.Messages.BetaContentBlockParam[] {
  return [
    {
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: o.jpeg.toString("base64") },
    },
    { type: "text", text: describeScreen(o, note) },
  ];
}

/** Use the app to reach one case's goal; the session keeps its state for the next case. */
async function runCase(
  createMessage: CreateMessage,
  model: string,
  session: AppSession,
  test: TestCase,
): Promise<CaseResult> {
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [];
  let observation = await session.observe();
  const errors = [...observation.errors];
  let note = `Test case: ${test.title}\nGoal: ${test.goal}\nExpected: ${test.expect}`;
  for (let step = 1; step <= MAX_STEPS; step++) {
    // One cache point, on the newest screen: each step re-reads the steps before it from the
    // cache instead of paying for them again.
    for (const m of messages)
      if (Array.isArray(m.content))
        for (const block of m.content) delete (block as { cache_control?: unknown }).cache_control;
    const blocks = screenBlocks(observation, note);
    (blocks.at(-1) as { cache_control?: unknown }).cache_control = { type: "ephemeral" };
    messages.push({ role: "user", content: blocks });
    const response = await createMessage({
      model,
      max_tokens: 2000,
      output_config: {
        effort: "low",
        format: {
          type: "json_schema",
          schema: ACTION_SCHEMA as unknown as Record<string, unknown>,
        },
      },
      system: TESTER_SYSTEM,
      messages,
    });
    const text = textOf(response);
    messages.push({ role: "assistant", content: text });
    let action: Action;
    try {
      action = JSON.parse(text) as Action;
    } catch {
      note = "That answer wasn't one action as JSON. Answer with one action.";
      continue;
    }
    if (action.action === "done") {
      const result = action.result === "none" ? "fail" : action.result;
      return {
        ...test,
        status: errors.length && result === "pass" ? "fail" : result,
        observed:
          errors.length && result === "pass"
            ? `It looked right, but the app threw: ${errors[0]}`
            : action.observed,
        path: observation.path,
        errors,
        steps: step,
      };
    }
    note = "";
    try {
      if (action.action === "tap") await session.tap(action.ref);
      else if (action.action === "type") await session.type(action.ref, action.text);
      else if (action.action === "scroll")
        await session.scroll(action.direction === "up" ? "up" : "down");
      else if (action.action === "wait") await session.wait(action.seconds);
      else if (action.action === "relaunch") {
        await session.relaunch();
        note = "The app was closed and opened again.";
      }
    } catch (error) {
      note = `That didn't work: ${(error as Error).message.split("\n")[0]}`;
    }
    observation = await session.observe();
    errors.push(...observation.errors);
  }
  return {
    ...test,
    status: "fail",
    observed: `Couldn't reach the goal in ${MAX_STEPS} steps; it ended on ${observation.path}.`,
    path: observation.path,
    errors,
    steps: MAX_STEPS,
  };
}

/**
 * Run the cases one after another in one session, adding each result to `into` as it finishes,
 * so a run that can't finish still reports the cases it did.
 */
async function runCases(
  createMessage: CreateMessage,
  model: string,
  files: ProjectFiles,
  cases: TestCase[],
  options: { themeId?: string; storage?: Record<string, string> },
  into: CaseResult[],
): Promise<CaseResult[]> {
  const session = await AppSession.open(files, options);
  try {
    for (const [i, test] of cases.entries()) {
      // Each case after the first starts from the app's first screen, with what's saved.
      if (i > 0) await session.relaunch();
      into.push(await runCase(createMessage, model, session, test));
    }
    return into;
  } finally {
    await session.close();
  }
}

async function writeCases(
  createMessage: CreateMessage,
  model: string,
  plan: AppPlan,
  files: ProjectFiles,
): Promise<TestCase[]> {
  const routes = Object.keys(files)
    .filter((p) => p.startsWith("app/") && !p.endsWith("_layout.tsx"))
    .map((p) => p.replace(/^app\//, "/").replace(/\.tsx$/, ""));
  const response = await createMessage({
    model,
    max_tokens: 8000,
    output_config: {
      effort: "low",
      format: { type: "json_schema", schema: CASES_SCHEMA as unknown as Record<string, unknown> },
    },
    system: CASES_SYSTEM,
    messages: [{ role: "user", content: casesRequest(plan, routes) }],
  });
  try {
    const { cases } = JSON.parse(textOf(response)) as { cases: TestCase[] };
    return cases.filter((c) => c.title && c.goal && c.expect).slice(0, MAX_CASES);
  } catch {
    return [];
  }
}

export function failureReport(results: CaseResult[]): string {
  return results
    .filter((r) => r.status === "fail")
    .map(
      (r) =>
        `- "${r.title}". Goal: ${r.goal} Expected: ${r.expect} What happened: ${r.observed} (ended on ${r.path})${
          r.errors.length ? ` The app threw: ${r.errors.slice(0, 2).join(" | ")}` : ""
        }`,
    )
    .join("\n");
}

/**
 * Test the app in the web preview and repair what fails (once), all free to the owner. Returns
 * null when this worker can't run a browser, or the model wrote no cases.
 */
export async function walkthroughApp(
  ctx: HandlerContext,
  input: {
    plan: AppPlan;
    files: ProjectFiles;
    themeId?: string;
    storage?: Record<string, string>;
    buildModel: string;
  },
): Promise<WalkthroughResult | null> {
  if (process.env.WALKTHROUGH === "0" || !(await canRunApps())) return null;
  const createMessage = freeCalls(ctx.createMessage);
  const model = ctx.offline ? ctx.model : TEST_MODEL();
  const options = { themeId: input.themeId, storage: input.storage };
  let files = input.files;
  let repaired = false;
  // The first run's results as they come in, and the results that stand once it finished.
  const firstRun: CaseResult[] = [];
  let standing: CaseResult[] | null = null;
  try {
    await ctx.emit("step", { label: "Writing test cases for what people will do in the app" });
    const cases = await writeCases(createMessage, model, input.plan, files);
    if (!cases.length)
      return {
        files,
        repaired: false,
        cases: [],
        stopped: "I couldn't write test cases for this app, so this build wasn't tested.",
      };
    await ctx.emit("step", {
      label: `Using the app like a person would: ${cases.map((c) => c.title).join(", ")}`,
    });
    let results = await runCases(createMessage, model, files, cases, options, firstRun);
    standing = results;
    const failed = results.filter((r) => r.status === "fail");
    if (failed.length && !ctx.overBudget()) {
      await ctx.emit("step", {
        label: `Fixing what didn't work: ${failed.map((r) => r.title).join(", ")}`,
      });
      const repair = await generateFiles({
        createMessage,
        model: input.buildModel,
        system: codeSystem("The app's current files:", filesAsContext(files)),
        request: `Testing the app in the preview the way a person uses it found these problems:\n${failureReport(results)}\n\nFix them so each of these works through the app's screens. Change only what the fixes need. Start with <summary>one sentence</summary>, then a <file> block with the complete new contents of every file you change.`,
        baseFiles: files,
      });
      if (repair.ok) {
        let next: ProjectFiles = { ...files, ...repair.files };
        for (const path of repair.deletes) delete next[path];
        next = withAppStructure(next);
        const issues = validateProject(next);
        if (hasErrors(issues)) {
          await ctx.emit("step", {
            label: `The fix didn't pass the platform's checks: ${formatIssues(issues).split("\n")[0]}`,
          });
        } else {
          await ctx.emit("step", { label: "Testing the app again after the fix" });
          const again = await runCases(createMessage, model, next, cases, options, []);
          // Keep the fix when it makes more cases pass and breaks none that passed.
          const passing = (rs: CaseResult[]) => rs.filter((r) => r.status === "pass").length;
          const broke = again.some((r, i) => results[i]?.status === "pass" && r.status !== "pass");
          if (passing(again) > passing(results) && !broke) {
            files = next;
            repaired = true;
            results = again.map((r, i) =>
              results[i]?.status === "fail" && r.status === "pass" ? { ...r, fixed: true } : r,
            );
          }
        }
      }
    }
    return { files, repaired, cases: results };
  } catch (error) {
    // The build is already saved: a test that can't finish never fails it.
    if (error instanceof Cancelled) throw error;
    if (!(error instanceof BudgetExceeded)) console.error("walkthrough stopped:", error);
    return {
      files,
      repaired,
      cases: standing ?? firstRun,
      stopped:
        error instanceof BudgetExceeded
          ? "The build's credit reserve ran out before the app could be tested."
          : "The test of the app couldn't finish.",
    };
  }
}

/** One paragraph for the build's chat message. */
export function walkthroughSummary(result: WalkthroughResult): string {
  if (!result.cases.length) return result.stopped ?? "";
  const passed = result.cases.filter((r) => r.status === "pass");
  const fixed = passed.filter((r) => r.fixed);
  const failed = result.cases.filter((r) => r.status === "fail");
  const blocked = result.cases.filter((r) => r.status === "blocked");
  const count = result.cases.length;
  const parts = [
    `I tested ${count} ${count === 1 ? "thing" : "things"} a person does in the app, in the web preview: ${passed.length} ${passed.length === 1 ? "works" : "work"}${
      fixed.length ? ` (I fixed ${fixed.map((r) => r.title).join(", ")})` : ""
    }.`,
  ];
  if (failed.length)
    parts.push(
      `Still not working: ${failed.map((r) => `${r.title} (${r.observed})`).join("; ")}. Ask me to fix ${failed.length === 1 ? "it" : "them"}.`,
    );
  if (blocked.length)
    parts.push(
      `Needs a phone to check: ${blocked.map((r) => `${r.title} (${r.observed})`).join("; ")}.`,
    );
  if (result.stopped) parts.push(result.stopped);
  return parts.join(" ");
}
