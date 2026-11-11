import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { CreateMessage } from "./generation/client";
import { BudgetExceeded, limitConcurrency, metered } from "./llm";

const reply = (input: number, output: number) =>
  ({
    content: [],
    stop_reason: "end_turn",
    usage: { input_tokens: input, output_tokens: output },
  }) as unknown as Anthropic.Beta.Messages.BetaMessage;

describe("metering", () => {
  it("prices each call by its own model, and stops a run at its budget", async () => {
    const create: CreateMessage = async () => reply(1_000_000, 100_000);
    const meter = metered(create, "claude-opus-5-5", 10);
    await meter.createMessage({ model: "claude-opus-5-5", max_tokens: 1, messages: [] });
    await meter.createMessage({ model: "claude-sonnet-5-5", max_tokens: 1, messages: [] });
    // Opus: $4 + $2; Sonnet: $2 + $1.
    expect(meter.cost()).toBeCloseTo(9);
    await meter.createMessage({ model: "claude-haiku-5-5", max_tokens: 1, messages: [] });
    expect(meter.cost()).toBeCloseTo(9.15);
    await meter.createMessage({ model: "claude-opus-5-5", max_tokens: 1, messages: [] });
    await expect(
      meter.createMessage({ model: "claude-opus-5-5", max_tokens: 1, messages: [] }),
    ).rejects.toBeInstanceOf(BudgetExceeded);
  });
});

describe("model request cap", () => {
  it("keeps at most N requests in flight across runs, serves the rest in order, and frees slots on errors", async () => {
    let inFlight = 0;
    let peak = 0;
    const order: number[] = [];
    const slow: CreateMessage = async (params) => {
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight -= 1;
      order.push(params.max_tokens);
      if (params.max_tokens === 3) throw new Error("rate limited");
      return reply(1, 1);
    };
    const capped = limitConcurrency(slow, 2);
    const results = await Promise.allSettled(
      Array.from({ length: 8 }, (_, i) =>
        capped({ model: "claude-opus-5-5", max_tokens: i, messages: [] }),
      ),
    );
    expect(peak).toBe(2);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    // A failure released its slot: everything after it still ran.
    expect(order.sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
