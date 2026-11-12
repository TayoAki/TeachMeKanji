import { costUsd, type TokenUsage } from "@appbuilder/core";
import { AgentError } from "./agents/agents";
import { addUsage, anthropicCreateMessage, type CreateMessage } from "./generation/client";
import { FAKE_MODEL, fakeCreateMessage } from "./generation/fake-provider";
import { openRouterChatCreateMessage, routedCreateMessage } from "./generation/openrouter-chat";

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
 * Otherwise requests go to Claude through the Anthropic SDK, and a model named by an OpenRouter
 * id (vendor/model, e.g. a Gemini or DeepSeek model set in GENERATION_MODEL) through OpenRouter.
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
    // One cap for every run on this worker: a build writes all its screens at once, so many
    // builds together would otherwise exceed the account's rate limit and fail.
    createMessage: limitConcurrency(
      routedCreateMessage(
        anthropicCreateMessage(),
        process.env.OPENROUTER_API_KEY
          ? openRouterChatCreateMessage(process.env.OPENROUTER_API_KEY, {
              maxRetries: Number(process.env.MODEL_MAX_RETRIES) || 4,
            })
          : null,
      ),
      Number(process.env.MAX_MODEL_REQUESTS) || 24,
    ),
    // Haiku by default: in the model test it built from mockups within three points of Opus and
    // Sonnet (80.1 against 82.8) at a twelfth of the cost. GENERATION_MODEL and EDIT_MODEL
    // switch to a larger model.
    model: process.env.GENERATION_MODEL || "claude-haiku-5-5",
    editModel: process.env.EDIT_MODEL || "claude-haiku-5-5",
    offline: false,
  };
}

/**
 * At most `max` model requests in flight at once; the rest wait their turn (first come, first
 * served). Waiting costs nothing: a request is only sent, and billed, once it gets a slot.
 */
export function limitConcurrency(createMessage: CreateMessage, max: number): CreateMessage {
  let active = 0;
  const waiting: Array<() => void> = [];
  const release = () => {
    active -= 1;
    waiting.shift()?.();
  };
  return async (params, hooks) => {
    if (active >= max) await new Promise<void>((resolve) => waiting.push(resolve));
    active += 1;
    try {
      return await createMessage(params, hooks);
    } finally {
      release();
    }
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
 * it succeeds, fails or is cancelled) and stop the run once its cost reaches its budget. Calls
 * marked free (repairs, the mockup match check) count toward the budget, which bounds what a
 * run can cost the platform, but not toward what the user pays.
 */
export function metered(createMessage: CreateMessage, model: string, budgetUsd: number) {
  let usage: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  // Each call is priced by the model it used (a run can mix models, e.g. an edit on Sonnet
  // after reading connectors on Opus); null while any call's model has no known price.
  let spent: number | null = 0;
  let freeSpent = 0;
  // Parallel calls each check the budget when they start, so a run can end slightly over it;
  // the charge itself is still capped at the reserve.
  const wrapped: CreateMessage = async (params, hooks) => {
    if (spent !== null && spent >= budgetUsd) throw new BudgetExceeded();
    const response = await createMessage(params, hooks);
    const callUsage = addUsage({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, response);
    usage = addUsage(usage, response);
    // A gateway that reports what it charged (OpenRouter's chat endpoint) is taken at its word;
    // otherwise tokens are priced from the list, plus web searches ($10 per 1,000).
    const gatewayCost = (response.usage as { gateway_cost_usd?: number } | undefined)
      ?.gateway_cost_usd;
    const searches = response.usage?.server_tool_use?.web_search_requests ?? 0;
    const callCost =
      typeof gatewayCost === "number"
        ? gatewayCost
        : (() => {
            const tokens = costUsd(params.model || model, callUsage);
            return tokens === null ? null : tokens + searches * WEB_SEARCH_USD;
          })();
    spent = spent === null || callCost === null ? null : spent + callCost;
    if (hooks?.free && callCost !== null) freeSpent += callCost;
    return response;
  };
  /** Add a cost that isn't model tokens (images drawn for the run), and enforce the budget. */
  const charge = (usd: number, options: { free?: boolean } = {}) => {
    if (spent !== null) spent += usd;
    if (options.free) freeSpent += usd;
  };
  const overBudget = () => spent !== null && spent >= budgetUsd;
  return {
    createMessage: wrapped,
    usage: () => usage,
    /** Everything the run cost the platform. */
    cost: () => spent,
    /** What the user pays: the cost without the free calls. */
    billable: () => (spent === null ? null : Math.max(0, spent - freeSpent)),
    /** What the free calls cost (shown to the user as fixes they didn't pay for). */
    freeCost: () => freeSpent,
    charge,
    overBudget,
  };
}

/** Calls that fix or check the platform's own work: within the run's budget, never charged. */
export function freeCalls(createMessage: CreateMessage): CreateMessage {
  return (params, hooks) => createMessage(params, { ...hooks, free: true });
}

/** Anthropic's web search tool: $10 per 1,000 searches. */
export const WEB_SEARCH_USD = 0.01;
