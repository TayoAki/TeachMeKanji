import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readTree } from "@appbuilder/contract/node";
import { buildApp, planApp } from "../agents/agents";
import { REPO_ROOT } from "../project";
import type { CreateMessage } from "./client";
import { fakeCreateMessage } from "./fake-provider";
import {
  chatRequest,
  modelSeesImages,
  openRouterChatCreateMessage,
  routedCreateMessage,
} from "./openrouter-chat";

process.env.FAKE_LLM_DELAY_MS = "0";

const sse = (events: unknown[]) =>
  new Response(
    `: OPENROUTER PROCESSING\n\n${events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("")}data: [DONE]\n\n`,
    { status: 200, headers: { "content-type": "text/event-stream" } },
  );

describe("OpenRouter chat endpoint (non-Claude models)", () => {
  it("translates system, images, structured output, effort and web search", () => {
    const body = chatRequest({
      model: "google/gemini-3.8-flash",
      max_tokens: 100,
      system: [{ type: "text", text: "Be brief." }],
      output_config: {
        effort: "xhigh",
        format: { type: "json_schema", schema: { type: "object" } },
      },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 3 }],
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } },
            { type: "text", text: "Hi" },
          ],
        },
      ],
    } as never);
    expect(body.messages).toEqual([
      { role: "system", content: "Be brief." },
      {
        role: "user",
        content: [
          { type: "image_url", image_url: { url: "data:image/png;base64,AAA" } },
          { type: "text", text: "Hi" },
        ],
      },
    ]);
    expect(body.reasoning).toEqual({ effort: "high" });
    expect(body.response_format).toMatchObject({ type: "json_schema" });
    expect(body.plugins).toEqual([{ id: "web", max_results: 3 }]);
    expect(body.stream).toBe(true);
  });

  it("never sends an image to a text-only model", () => {
    expect(modelSeesImages("deepseek/deepseek-v4-flash")).toBe(false);
    const body = chatRequest({
      model: "deepseek/deepseek-v4-flash",
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: [
            { type: "image", source: { type: "base64", media_type: "image/png", data: "AAA" } },
          ],
        },
      ],
    } as never);
    expect(JSON.stringify(body.messages)).not.toContain("image_url");
  });

  it("streams the answer back as a message with usage and the gateway's cost, retrying a 429", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      if (calls === 1) return new Response("slow down", { status: 429 });
      return sse([
        { id: "gen-1", choices: [{ delta: { content: '```json\n{"a":' } }] },
        { id: "gen-1", choices: [{ delta: { content: "1}\n```" }, finish_reason: "stop" }] },
        {
          id: "gen-1",
          choices: [],
          usage: {
            prompt_tokens: 100,
            completion_tokens: 20,
            prompt_tokens_details: { cached_tokens: 60 },
            cost: 0.0042,
          },
        },
      ]);
    }) as unknown as typeof fetch;
    let started = 0;
    const create = openRouterChatCreateMessage("k", { fetchImpl, maxRetries: 1 });
    // No real back-off wait in the test.
    const realTimeout = globalThis.setTimeout;
    globalThis.setTimeout = ((fn: () => void) => realTimeout(fn, 0)) as typeof setTimeout;
    try {
      const message = await create(
        {
          model: "deepseek/deepseek-v4-flash",
          max_tokens: 10,
          output_config: { format: { type: "json_schema", schema: {} } },
          messages: [{ role: "user", content: "x" }],
        } as never,
        { onStreamStart: () => started++ },
      );
      expect(calls).toBe(2);
      expect(started).toBe(1);
      expect(message.stop_reason).toBe("end_turn");
      expect(message.content).toEqual([{ type: "text", text: '{"a":1}', citations: null }]);
      expect(message.usage).toMatchObject({
        input_tokens: 40,
        cache_read_input_tokens: 60,
        output_tokens: 20,
        gateway_cost_usd: 0.0042,
      });
    } finally {
      globalThis.setTimeout = realTimeout;
    }
  });

  it("routes vendor/model ids to the chat endpoint and Claude ids to the SDK", async () => {
    const seen: string[] = [];
    const tag =
      (name: string): CreateMessage =>
      async (params) => {
        seen.push(`${name}:${params.model}`);
        return {} as never;
      };
    const create = routedCreateMessage(tag("claude"), tag("chat"));
    await create({ model: "claude-haiku-5-5", max_tokens: 1, messages: [] });
    await create({ model: "google/gemini-3.8-flash", max_tokens: 1, messages: [] });
    expect(seen).toEqual(["claude:claude-haiku-5-5", "chat:google/gemini-3.8-flash"]);
    await expect(
      routedCreateMessage(
        tag("claude"),
        null,
      )({
        model: "deepseek/deepseek-v4-flash",
        max_tokens: 1,
        messages: [],
      }),
    ).rejects.toThrow(/OPENROUTER_API_KEY/);
  });

  it("builds from the written briefs (and the motion plan) when the build model can't see images", async () => {
    const { plan } = await planApp({
      createMessage: fakeCreateMessage,
      prompt: "A sleep tracker",
      platforms: "both",
      defaultScreens: 3,
      maxScreens: 5,
    });
    const template = await readTree(join(REPO_ROOT, "templates/expo-app"));
    const requests: string[] = [];
    const recording: CreateMessage = async (params, hooks) => {
      requests.push(JSON.stringify(params.messages[0]!.content));
      return fakeCreateMessage({ ...params, model: "fake" }, hooks);
    };
    const mockup = { mediaType: "image/png" as const, data: "AAA" };
    await buildApp({
      createMessage: recording,
      plan,
      template,
      model: "deepseek/deepseek-v4-flash",
      design: {
        mockups: Object.fromEntries(plan.screens.map((s) => [s.path, mockup])),
        briefs: Object.fromEntries(plan.screens.map((s) => [s.path, `BRIEF FOR ${s.path}`])),
        style: "PALETTE midnight navy",
        motion: {
          personality: "Slow and hushed",
          perScreen: { [plan.screens[0]!.path]: ["Rows rise in a 40ms stagger"] },
        },
      },
    });
    expect(requests.some((r) => r.includes('"type":"image"'))).toBe(false);
    expect(requests.some((r) => r.includes("PALETTE midnight navy"))).toBe(true);
    for (const screen of plan.screens)
      expect(requests.some((r) => r.includes(`BRIEF FOR ${screen.path}`))).toBe(true);
    // The design's motion plan reaches the screen it belongs to.
    const first = requests.find((r) => r.includes(`BRIEF FOR ${plan.screens[0]!.path}`))!;
    expect(first).toContain("Rows rise in a 40ms stagger");
    expect(first).toContain("components/motion");
  });
});
