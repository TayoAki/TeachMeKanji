import Anthropic from "@anthropic-ai/sdk";

export interface CallHooks {
  /** Called once, when the response starts streaming: its prompt prefix is now cached. */
  onStreamStart?: () => void;
}

export type CreateMessage = (
  params: Anthropic.Beta.Messages.MessageCreateParamsNonStreaming,
  hooks?: CallHooks,
) => Promise<Anthropic.Beta.Messages.BetaMessage>;

export const DEFAULT_MODEL = process.env.GENERATION_MODEL || "claude-opus-5-5";
export const DEFAULT_EFFORT = (process.env.GENERATION_EFFORT || "high") as
  "low" | "medium" | "high" | "xhigh" | "max";

/**
 * Streams every request (long code outputs must not hit HTTP timeouts) and returns the final
 * message. Server-side refusal fallback is enabled: if the model's safety classifier declines,
 * the API re-runs the request on Anthropic's recommended fallback model in the same call.
 */
export function anthropicCreateMessage(
  // Rate-limit (429) and overload (529) answers are retried with the API's own back-off.
  client = new Anthropic({ maxRetries: Number(process.env.MODEL_MAX_RETRIES) || 4 }),
): CreateMessage {
  return (params, hooks) => {
    // Haiku has no server-side fallback (a fallbacks field is a 400), and gateways in front of
    // the API (ANTHROPIC_BASE_URL, e.g. OpenRouter) read `fallbacks` as their own setting.
    const fallback = !String(params.model).startsWith("claude-haiku") && !gatewayInUse();
    const stream = client.beta.messages.stream({
      ...params,
      ...(fallback
        ? {
            betas: [...(params.betas ?? []), "server-side-fallback-2026-07-01"],
            fallbacks: "default",
          }
        : {}),
    });
    if (hooks?.onStreamStart) stream.once("streamEvent", () => hooks.onStreamStart?.());
    return stream.finalMessage();
  };
}

/** True when model requests go through a gateway instead of Anthropic's own API. */
export function gatewayInUse(): boolean {
  const base = process.env.ANTHROPIC_BASE_URL || "";
  return base !== "" && !/^https:\/\/api\.anthropic\.com\/?$/.test(base);
}

export function textOf(message: Anthropic.Beta.Messages.BetaMessage): string {
  return message.content
    .filter((block): block is Anthropic.Beta.Messages.BetaTextBlock => block.type === "text")
    .map((block) => block.text)
    .join("");
}

export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export function addUsage(
  totals: UsageTotals,
  message: Anthropic.Beta.Messages.BetaMessage,
): UsageTotals {
  return {
    input: totals.input + message.usage.input_tokens,
    output: totals.output + message.usage.output_tokens,
    cacheRead: totals.cacheRead + (message.usage.cache_read_input_tokens ?? 0),
    cacheWrite: totals.cacheWrite + (message.usage.cache_creation_input_tokens ?? 0),
  };
}

/** List prices per million tokens (USD) as of 2026-10; verify before using for billing. */
const PRICES: Record<
  string,
  { input: number; output: number; cacheRead: number; cacheWrite: number }
> = {
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.1, cacheWrite: 2.5 },
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
};

export function estimateCostUsd(model: string, usage: UsageTotals): number | null {
  const price = PRICES[model];
  if (!price) return null;
  return (
    (usage.input * price.input +
      usage.output * price.output +
      usage.cacheRead * price.cacheRead +
      usage.cacheWrite * price.cacheWrite) /
    1_000_000
  );
}
