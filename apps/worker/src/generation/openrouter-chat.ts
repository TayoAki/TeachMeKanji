/**
 * Models other than Claude (an OpenRouter id such as "google/gemini-3.8-flash" or
 * "deepseek/deepseek-v4-flash"), reached through OpenRouter's OpenAI-compatible chat completions
 * endpoint: its Anthropic-compatible one serves Claude only. Requests keep the Messages shape the
 * rest of the worker uses (system, text and image blocks, structured output, effort, web search)
 * and answers come back as Messages too (text, stop reason, usage with cache reads), streamed so
 * long code outputs don't hit HTTP timeouts.
 */
import type Anthropic from "@anthropic-ai/sdk";
import type { CallHooks, CreateMessage } from "./client";

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;
type Block = Anthropic.Beta.Messages.BetaContentBlockParam;

/** A model id that goes to OpenRouter's chat endpoint (vendor/model) rather than to Claude. */
export const isChatModel = (model: string) => model.includes("/");

/** Models that read text only: requests to them carry briefs instead of images. */
export function modelSeesImages(model: string): boolean {
  return !/^deepseek\//.test(model);
}

type Part = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };
interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Part[];
}

function parts(content: string | Block[], seesImages: boolean): string | Part[] {
  if (typeof content === "string") return content;
  const out: Part[] = [];
  for (const block of content) {
    if (block.type === "text") out.push({ type: "text", text: block.text });
    else if (block.type === "image") {
      const source = block.source as {
        type: string;
        media_type?: string;
        data?: string;
        url?: string;
      };
      if (!seesImages)
        out.push({
          type: "text",
          text: "(An image was attached here; this model can't see images.)",
        });
      else if (source.type === "base64")
        out.push({
          type: "image_url",
          image_url: { url: `data:${source.media_type};base64,${source.data}` },
        });
      else if (source.type === "url" && source.url)
        out.push({ type: "image_url", image_url: { url: source.url } });
    }
    // Thinking, tool and search-result blocks have no equivalent here; they're left out.
  }
  return out;
}

export function chatRequest(params: Params): Record<string, unknown> {
  const sees = modelSeesImages(params.model);
  const system =
    typeof params.system === "string"
      ? params.system
      : (params.system ?? []).map((block) => block.text).join("\n\n");
  const messages: ChatMessage[] = [
    ...(system ? [{ role: "system" as const, content: system }] : []),
    ...params.messages.map((m) => ({
      role: m.role,
      content: parts(m.content as string | Block[], sees),
    })),
  ];
  const config = params.output_config as
    { effort?: string; format?: { type: string; schema?: Record<string, unknown> } } | undefined;
  const effort = config?.effort;
  const search = (params.tools ?? []).find((tool) =>
    String((tool as { type?: string }).type ?? "").startsWith("web_search"),
  ) as { max_uses?: number } | undefined;
  return {
    model: params.model,
    max_tokens: params.max_tokens,
    messages,
    ...(effort
      ? { reasoning: { effort: effort === "low" || effort === "medium" ? effort : "high" } }
      : {}),
    ...(config?.format?.type === "json_schema"
      ? {
          response_format: {
            type: "json_schema",
            json_schema: { name: "output", strict: true, schema: config.format.schema },
          },
        }
      : {}),
    ...(search ? { plugins: [{ id: "web", max_results: search.max_uses ?? 5 }] } : {}),
    stream: true,
    usage: { include: true },
  };
}

interface ChatUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
  prompt_tokens_details?: { cached_tokens?: number; cache_write_tokens?: number };
  cost?: number;
}

const STOP: Record<string, Anthropic.Beta.Messages.BetaStopReason> = {
  stop: "end_turn",
  length: "max_tokens",
  content_filter: "refusal",
  tool_calls: "tool_use",
};

/** Strip a ```json fence some models put around structured output. */
const unfence = (text: string) => text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/, "$1");

class RetryableError extends Error {}

/** One streamed request; throws RetryableError for rate limits, overloads and dropped streams. */
async function streamOnce(
  base: string,
  key: string,
  body: Record<string, unknown>,
  hooks: CallHooks | undefined,
  fetchImpl: typeof fetch,
): Promise<{ text: string; finish: string | null; usage: ChatUsage; id: string }> {
  const response = await fetchImpl(`${base}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!response.ok || !response.body) {
    const detail = await response.text().catch(() => "");
    const message = `OpenRouter ${response.status}: ${detail.slice(0, 300)}`;
    if (response.status === 429 || response.status >= 500) throw new RetryableError(message);
    throw new Error(message);
  }
  let text = "";
  let finish: string | null = null;
  let usage: ChatUsage = {};
  let id = "";
  let started = false;
  let buffer = "";
  const decoder = new TextDecoder();
  for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
    buffer += decoder.decode(chunk, { stream: true });
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (!line.startsWith("data:")) continue; // keep-alive comments
      const data = line.slice(5).trim();
      if (data === "[DONE]") continue;
      const event = JSON.parse(data) as {
        id?: string;
        error?: { message?: string; code?: number };
        choices?: Array<{ delta?: { content?: string | null }; finish_reason?: string | null }>;
        usage?: ChatUsage;
      };
      if (event.error) {
        const message = `OpenRouter: ${event.error.message ?? "the provider failed"}`;
        // A provider error before any output is worth another try; after output it isn't.
        if (!text) throw new RetryableError(message);
        throw new Error(message);
      }
      if (!started) {
        started = true;
        hooks?.onStreamStart?.();
      }
      id = event.id ?? id;
      const choice = event.choices?.[0];
      if (choice?.delta?.content) text += choice.delta.content;
      if (choice?.finish_reason) finish = choice.finish_reason;
      if (event.usage) usage = event.usage;
    }
  }
  if (!finish && !text) throw new RetryableError("OpenRouter: the stream ended with no answer");
  return { text, finish, usage, id };
}

export function openRouterChatCreateMessage(
  key: string,
  options: { base?: string; maxRetries?: number; fetchImpl?: typeof fetch } = {},
): CreateMessage {
  const base = options.base || "https://openrouter.ai/api/v1";
  const maxRetries = options.maxRetries ?? 4;
  const fetchImpl = options.fetchImpl ?? fetch;
  return async (params, hooks) => {
    const body = chatRequest(params);
    let result: Awaited<ReturnType<typeof streamOnce>> | undefined;
    for (let attempt = 0; ; attempt++) {
      try {
        result = await streamOnce(base, key, body, hooks, fetchImpl);
        break;
      } catch (error) {
        const retryable = error instanceof RetryableError || (error as Error).name === "TypeError";
        if (!retryable || attempt >= maxRetries) throw error;
        await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
      }
    }
    const prompt = result.usage.prompt_tokens ?? 0;
    const cached = result.usage.prompt_tokens_details?.cached_tokens ?? 0;
    const written = result.usage.prompt_tokens_details?.cache_write_tokens ?? 0;
    const structured = Boolean((body as { response_format?: unknown }).response_format);
    return {
      id: result.id,
      type: "message",
      role: "assistant",
      model: params.model,
      content: [
        { type: "text", text: structured ? unfence(result.text) : result.text, citations: null },
      ],
      stop_reason: STOP[result.finish ?? "stop"] ?? "end_turn",
      stop_sequence: null,
      usage: {
        input_tokens: Math.max(0, prompt - cached - written),
        output_tokens: result.usage.completion_tokens ?? 0,
        cache_read_input_tokens: cached,
        cache_creation_input_tokens: written,
        // What OpenRouter charged for the call (searches and reasoning included).
        gateway_cost_usd: result.usage.cost,
      },
    } as unknown as Anthropic.Beta.Messages.BetaMessage;
  };
}

/** Claude ids go to the Anthropic SDK; vendor/model ids go to OpenRouter's chat endpoint. */
export function routedCreateMessage(
  claude: CreateMessage,
  chat: CreateMessage | null,
): CreateMessage {
  return async (params, hooks) => {
    if (!isChatModel(String(params.model))) return claude(params, hooks);
    if (!chat)
      throw new Error(
        `The model ${params.model} needs OPENROUTER_API_KEY (it is reached through OpenRouter).`,
      );
    return chat(params, hooks);
  };
}
