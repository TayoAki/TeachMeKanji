import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { CreateMessage } from "./generation/client";
import { BudgetExceeded, metered } from "./llm";

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
