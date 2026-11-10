import { eq } from "drizzle-orm";
import type Anthropic from "@anthropic-ai/sdk";
import {
  APP_AI,
  AppCloudError,
  assertAppAiAllowed,
  costUsd,
  recordAppAiCall,
  WindowLimiter,
} from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { anthropicCreateMessage, textOf, type CreateMessage } from "@appbuilder/worker/client";
import { fakeCreateMessage } from "@appbuilder/worker/fake-provider";
import { appRoute, body, json, preflight } from "@/lib/app-cloud-http";
import { db } from "@/lib/server";

export const OPTIONS = preflight;

const perUser = new WindowLimiter(APP_AI.callsPerUserPerHour, 60 * 60_000);
let client: CreateMessage | null = null;
const createMessage = (): CreateMessage =>
  process.env.LLM_PROVIDER === "fake" ? fakeCreateMessage : (client ??= anthropicCreateMessage());

const IMAGE_TYPES = {
  "/9j/": "image/jpeg",
  iVBOR: "image/png",
  R0lG: "image/gif",
  UklG: "image/webp",
};

/**
 * askAI() from a generated app (template data/ai.ts): one question, optionally with a photo,
 * answered by a small fast model. The app's owner pays from their credits (see app-ai.ts).
 */
export const POST = appRoute(async (request, ctx) => {
  const user = ctx.requireUser();
  const input = await body<{
    prompt?: string;
    instructions?: string;
    image?: string;
    json?: boolean;
  }>(request, APP_AI.imageBytes * 1.4);
  const prompt = String(input.prompt ?? "").trim();
  if (!prompt || prompt.length > APP_AI.promptChars)
    throw new AppCloudError(400, `Ask something between 1 and ${APP_AI.promptChars} characters.`);
  if (!perUser.take(`${ctx.projectId}:${user.id}`))
    throw new AppCloudError(429, "Too many AI requests. Try again in a while.");
  const [project] = await db()
    .select({ ownerId: schema.project.ownerId, name: schema.project.name })
    .from(schema.project)
    .where(eq(schema.project.id, ctx.projectId));
  await assertAppAiAllowed(db(), ctx.projectId, project!.ownerId);

  const content: Anthropic.Beta.Messages.BetaContentBlockParam[] = [];
  if (input.image) {
    const data = String(input.image).replace(/^data:[^,]+,/, "");
    const mediaType = Object.entries(IMAGE_TYPES).find(([prefix]) => data.startsWith(prefix))?.[1];
    if (!mediaType) throw new AppCloudError(400, "The photo must be a JPEG, PNG, GIF or WebP.");
    content.push({
      type: "image",
      source: { type: "base64", media_type: mediaType as "image/png", data },
    });
  }
  content.push({ type: "text", text: prompt });
  const instructions = String(input.instructions ?? "").slice(0, APP_AI.instructionChars);
  const response = await createMessage()({
    model: APP_AI.model,
    max_tokens: APP_AI.maxOutputTokens,
    thinking: { type: "disabled" },
    output_config: { effort: "low" },
    system: [
      `You are the AI inside "${project!.name}", a mobile app. Answer the person using the app: short, clear and friendly, in plain text that fits a phone screen (no markdown headings or tables).${
        input.json ? " Reply with JSON only, no other text." : ""
      }`,
      instructions ? `The app's instructions for you:\n${instructions}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    messages: [{ role: "user", content }],
  });
  const usage = {
    input: response.usage.input_tokens,
    output: response.usage.output_tokens,
    cacheRead: response.usage.cache_read_input_tokens ?? 0,
    cacheWrite: response.usage.cache_creation_input_tokens ?? 0,
  };
  await recordAppAiCall(db(), {
    projectId: ctx.projectId,
    ownerId: project!.ownerId,
    costUsd: costUsd(APP_AI.model, usage) ?? 0,
  });
  if (response.stop_reason === "refusal")
    throw new AppCloudError(422, "The AI couldn't help with that. Try asking differently.");
  return json({ text: textOf(response).trim() });
});
