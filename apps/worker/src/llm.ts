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
  /** The model for plans and builds, or the offline generator's id. */
  model: string;
  /** The model for chat edits (cheaper: an edit reads the app and changes a few files). */
  editModel: string;
  offline: boolean;
}

/**
 * LLM_PROVIDER=fake uses the offline template generator (tests, demos without an API key).
 * Otherwise requests go to Claude through the Anthropic SDK.
 */
export function getProvider(): Provider {
  if (process.env.LLM_PROVIDER === "fake")
    return {
      createMessage: fakeCreateMessage,
      model: FAKE_MODEL,
      editModel: FAKE_MODEL,
      offline: true,
    };
  return {
    createMessage: anthropicCreateMessage(),
    model: process.env.GENERATION_MODEL || "claude-opus-5-5",
    editModel: process.env.EDIT_MODEL || "claude-sonnet-5-5",
    offline: false,
  };
}

/** Wrap a provider so a cancelled run stops before its next model call. */
export function cancellable(
  createMessage: CreateMessage,
  isCancelled: () => boolean,
): CreateMessage {
  return async (params, hooks) => {
    if (isCancelled()) throw new Cancelled();
    const result = await createMessage(params, hooks);
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
  // Each call is priced by the model it used (a run can mix models, e.g. an edit on Sonnet
  // after reading connectors on Opus); null while any call's model has no known price.
  let spent: number | null = 0;
  // Parallel calls each check the budget when they start, so a run can end slightly over it;
  // the charge itself is still capped at the reserve.
  const wrapped: CreateMessage = async (params, hooks) => {
    if (spent !== null && spent >= budgetUsd) throw new BudgetExceeded();
    const response = await createMessage(params, hooks);
    const callUsage = addUsage({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, response);
    usage = addUsage(usage, response);
    const callCost = costUsd(params.model || model, callUsage);
    spent = spent === null || callCost === null ? null : spent + callCost;
    return response;
  };
  return { createMessage: wrapped, usage: () => usage, cost: () => spent };
}
