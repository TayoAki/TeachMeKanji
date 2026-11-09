import { anthropicCreateMessage, type CreateMessage } from "./generation/client";
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
    model: process.env.GENERATION_MODEL ?? "claude-opus-5-5",
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
