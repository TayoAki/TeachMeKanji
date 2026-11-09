import { costUsd, type TokenUsage } from "@appbuilder/core";
import { AgentError } from "./agents/agents";
import { addUsage, anthropicCreateMessage, type CreateMessage } from "./generation/client";
import { FAKE_MODEL, fakeCreateMessage } from "./generation/fake-provider";

export class Cancelled extends Error {
  constructor() {
    super("Cancelled");
  }
}

export interface Provider {
  createMessage: CreateMessage;
  /** Model id used for pricing, or the offline generator's id. */
  model: string;
  offline: boolean;
}

/**
 * LLM_PROVIDER=fake uses the offline template generator (tests, demos without an API key).
 * Otherwise requests go to Claude through the Anthropic SDK.
 */
export function getProvider(): Provider {
  if (process.env.LLM_PROVIDER === "fake")
    return { createMessage: fakeCreateMessage, model: FAKE_MODEL, offline: true };
  return {
    createMessage: anthropicCreateMessage(),
    model: process.env.GENERATION_MODEL || "claude-opus-5-5",
    offline: false,
  };
}

/** Wrap a provider so a cancelled run stops before its next model call. */
export function cancellable(
  createMessage: CreateMessage,
  isCancelled: () => boolean,
): CreateMessage {
  return async (params) => {
    if (isCancelled()) throw new Cancelled();
    const result = await createMessage(params);
    if (isCancelled()) throw new Cancelled();
    return result;
  };
}

export class BudgetExceeded extends AgentError {
  constructor() {
    super("This step reached its credit limit and was stopped. Try a smaller change.");
  }
}

/**
 * Meter every model call of a run (the source of truth for what the run is charged, whether
 * it succeeds, fails or is cancelled) and stop the run once its cost reaches its budget.
 */
export function metered(createMessage: CreateMessage, model: string, budgetUsd: number) {
  let usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const wrapped: CreateMessage = async (params) => {
    const spent = costUsd(model, usage);
    if (spent !== null && spent >= budgetUsd) throw new BudgetExceeded();
    const response = await createMessage(params);
    usage = addUsage(usage, response);
    return response;
  };
  return { createMessage: wrapped, usage: () => usage };
}
