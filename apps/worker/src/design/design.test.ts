import { join } from "node:path";
import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { poseImageName, readAppImages } from "@appbuilder/contract";
import { readTree } from "@appbuilder/contract/node";
import { buildApp, planApp, withPlanDefaultTheme } from "../agents/agents";
import type Anthropic from "@anthropic-ai/sdk";
import type { CreateMessage } from "../generation/client";
import { fakeCreateMessage } from "../generation/fake-provider";
import { offlineImages } from "../images/client";
import { cutOutCharacter } from "../images/key";
import { metered, WEB_SEARCH_USD } from "../llm";
import { REPO_ROOT } from "../project";
import { checkAndFix, chooseDirection, drawMascot, pickKeyScreen, type DesignDeps } from "./engine";
import { researchIdea } from "./research";

process.env.FAKE_LLM_DELAY_MS = "0";

async function offlinePlan() {
  const { plan } = await planApp({
    createMessage: fakeCreateMessage,
    prompt: "A water tracker with a friendly mascot",
    platforms: "both",
    defaultScreens: 3,
    maxScreens: 5,
  });
  return plan;
}

function offlineDeps(spent: number[] = []): DesignDeps {
  return {
    createMessage: fakeCreateMessage,
    images: offlineImages(),
    directionModel: "fake",
    reviewModel: "fake",
    charge: (usd) => spent.push(usd),
    overBudget: () => false,
  };
}

const alphaAt = async (png: Buffer, x: number, y: number) => {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return data[(y * info.width + x) * 4 + 3]!;
};

describe("design-first pipeline (offline)", () => {
  it("researches, sets a direction with one brief per plan screen, and draws a cut-out mascot", async () => {
    const { research } = await researchIdea({
      createMessage: fakeCreateMessage,
      idea: "A water tracker",
    });
    expect(research?.brief).toMatch(/Offline research/);

    const plan = await offlinePlan();
    const deps = offlineDeps();
    const direction = await chooseDirection(deps, plan, research);
    expect(direction.screens.map((s) => s.path)).toEqual(plan.screens.map((s) => s.path));
    expect(direction.palette.primary).toBe(plan.themes[0]!.primary);
    expect(direction.mascot?.poses.map((p) => p.name)).toEqual(["neutral", "happy", "sleepy"]);

    const poses = await drawMascot(deps, plan, direction);
    expect(poses).toHaveLength(3);
    // The green background is gone (transparent corner) and the character is kept (opaque middle).
    const meta = await sharp(poses[0]!.png).metadata();
    expect(meta.hasAlpha).toBe(true);
    expect(await alphaAt(poses[0]!.png, 1, 1)).toBe(0);
    expect(
      await alphaAt(poses[0]!.png, Math.floor(meta.width! / 2), Math.floor(meta.height! / 2)),
    ).toBe(255);

    const a = await deps.images.draw({ prompt: "Today screen", aspect: "9:16" });
    const b = await deps.images.draw({ prompt: "Today screen, option 2", aspect: "9:16" });
    expect((await pickKeyScreen(deps, "brief", direction, a.data, b.data)).winner).toBe(1);
    // A clean mockup comes back unchanged (no edit, no extra image).
    expect(await checkAndFix(deps, a.data, a)).toBe(a);
  });

  it("drops a stray sketch drawn apart from the character, and keeps what touches it", async () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="100%" height="100%" fill="#12D02E"/><circle cx="200" cy="160" r="90" fill="#E5803A"/><rect x="190" y="50" width="20" height="30" fill="#FFD84A"/><rect x="40" y="330" width="40" height="40" fill="#222222"/></svg>`;
    const png = await cutOutCharacter(await sharp(Buffer.from(svg)).png().toBuffer());
    const meta = await sharp(png).metadata();
    // Trimmed to the character (and its hat), not the sketch in the corner.
    expect(meta.width).toBeLessThan(260);
    expect(meta.height).toBeLessThan(260);
  });

  it("builds from approved mockups: the mascot poses become app images, and the plan's theme is the default", async () => {
    const plan = await offlinePlan();
    const template = await readTree(join(REPO_ROOT, "templates/expo-app"));
    const mock = await offlineImages().draw({ prompt: "mockup", aspect: "9:16" });
    const mockups = Object.fromEntries(
      plan.screens.map((s) => [
        s.path,
        { mediaType: "image/png" as const, data: mock.data.toString("base64") },
      ]),
    );
    const name = poseImageName("Buddy", "neutral");
    const seen: string[] = [];
    const recording: CreateMessage = async (params, hooks) => {
      const last = params.messages.at(-1)!;
      if (Array.isArray(last.content) && last.content.some((b) => b.type === "image"))
        seen.push("image");
      return fakeCreateMessage(params, hooks);
    };
    const built = await buildApp({
      createMessage: recording,
      plan,
      template,
      design: { mockups, images: { [name]: "https://example.com/api/app-images/img_1" } },
    });
    expect(readAppImages(built.files)[name]).toBe("https://example.com/api/app-images/img_1");
    // The theme step and every screen saw its mockup.
    expect(seen.length).toBe(plan.screens.length + 1);
    expect(built.files["theme/tokens.ts"]).toContain(`defaultThemeId = "${plan.themes[0]!.id}"`);
  });

  it("sets the plan's first theme as the default when the model picked another", () => {
    const plan = { themes: [{ id: "lagoon" }, { id: "midnight" }] } as never;
    const files = withPlanDefaultTheme(
      {
        "theme/tokens.ts": `export const themes = [{ id: "lagoon" }, { id: "midnight" }];\nexport const defaultThemeId = "midnight";\n`,
      },
      plan,
    );
    expect(files["theme/tokens.ts"]).toContain('export const defaultThemeId = "lagoon"');
  });

  it("sets it too when the model typed the declaration", () => {
    const plan = { themes: [{ id: "lagoon" }, { id: "midnight" }] } as never;
    const files = withPlanDefaultTheme(
      {
        "theme/tokens.ts": `export const themes = [{ id: "lagoon" }, { id: "midnight" }];\nexport const defaultThemeId: string = "midnight";\n`,
      },
      plan,
    );
    expect(files["theme/tokens.ts"]).toContain('export const defaultThemeId = "lagoon"');
  });
});

describe("run costs beyond tokens", () => {
  it("adds image spend and web searches to the run's cost", async () => {
    const response = {
      content: [{ type: "text", text: "{}" }],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
        server_tool_use: { web_search_requests: 3 },
      },
    } as unknown as Anthropic.Beta.Messages.BetaMessage;
    const meter = metered(async () => response, "claude-sonnet-5-5", 1);
    await meter.createMessage({ model: "claude-sonnet-5-5", max_tokens: 10, messages: [] });
    meter.charge(0.14);
    expect(meter.cost()).toBeCloseTo(3 * WEB_SEARCH_USD + 0.14, 6);
    expect(meter.overBudget()).toBe(false);
    meter.charge(1);
    expect(meter.overBudget()).toBe(true);
  });

  it("resumes a paused web search and falls back to no research when the answer isn't JSON", async () => {
    const replies = ["pause_turn", "end_turn"];
    let calls = 0;
    const createMessage: CreateMessage = async () => {
      calls++;
      return {
        content: [{ type: "text", text: "not json" }],
        stop_reason: replies.shift(),
        usage: {
          input_tokens: 1,
          output_tokens: 1,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 0,
        },
      } as unknown as Anthropic.Beta.Messages.BetaMessage;
    };
    const { research, usage } = await researchIdea({ createMessage, idea: "x" });
    expect(calls).toBe(2);
    expect(research).toBeNull();
    expect(usage.input).toBe(2);
  });
});
