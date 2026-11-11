/**
 * The design steps, without storage: choose the direction, draw the mascot's poses, draw and
 * rate the key screen, draw a screen to match it, and check a mockup and fix what's wrong.
 * Every image is charged to the run as it's drawn, and no new image starts once the run's
 * credit reserve is spent.
 */
import type Anthropic from "@anthropic-ai/sdk";
import {
  DESIGN_DIRECTION_JSON_SCHEMA,
  normalizeDirection,
  type AppPlan,
  type DesignDirection,
  type ResearchBrief,
} from "@appbuilder/contract";
import { AgentError } from "../agents/agents";
import { addUsage, textOf, type CreateMessage, type UsageTotals } from "../generation/client";
import { cutOutCharacter } from "../images/key";
import { mediaTypeOf, type DrawnImage, type ImageModel, type ImageRequest } from "../images/client";
import { BudgetExceeded } from "../llm";
import {
  CHECK_JSON_SCHEMA,
  CHECK_REQUEST,
  CHECK_SYSTEM,
  designRequest,
  designSystem,
  fixMockupPrompt,
  mascotPosePrompt,
  RATE_JSON_SCHEMA,
  RATE_SYSTEM,
  rateRequest,
} from "./prompts";

export interface DesignDeps {
  createMessage: CreateMessage;
  /** Draws the mascot, the other screens and fixes. */
  images: ImageModel;
  /** Draws the key screen's two options (the one the rest copies); `images` when not set. */
  keyImages?: ImageModel;
  /** Model for the design direction (structured output). */
  directionModel: string;
  /** Model for rating and checking mockups (vision). */
  reviewModel: string;
  charge: (usd: number) => void;
  overBudget: () => boolean;
}

export interface Usage {
  usage: UsageTotals;
}

const imageBlock = (data: Buffer): Anthropic.Beta.Messages.BetaImageBlockParam => ({
  type: "image",
  source: { type: "base64", media_type: mediaTypeOf(data), data: data.toString("base64") },
});

export async function draw(
  deps: DesignDeps,
  request: ImageRequest,
  model: ImageModel = deps.images,
): Promise<DrawnImage> {
  if (deps.overBudget()) throw new BudgetExceeded();
  const image = await model.draw(request);
  deps.charge(image.costUsd);
  return image;
}

/** An option for the key screen, on the key-screen model. */
export const drawKey = (deps: DesignDeps, request: ImageRequest) =>
  draw(deps, request, deps.keyImages ?? deps.images);

async function structured<T>(
  deps: DesignDeps,
  params: {
    model: string;
    system: string;
    content: Anthropic.Beta.Messages.BetaContentBlockParam[];
    schema: unknown;
    maxTokens?: number;
  },
): Promise<{ value: T; usage: UsageTotals }> {
  const response = await deps.createMessage({
    model: params.model,
    max_tokens: params.maxTokens ?? 4000,
    output_config: {
      effort: "medium",
      format: { type: "json_schema", schema: params.schema as Record<string, unknown> },
    },
    system: params.system,
    messages: [{ role: "user", content: params.content }],
  });
  const usage = addUsage({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, response);
  if (response.stop_reason !== "end_turn")
    throw new AgentError("The designer stopped before finishing. Please try again.");
  try {
    return { value: JSON.parse(textOf(response)) as T, usage };
  } catch {
    throw new AgentError("The designer returned something unreadable. Please try again.");
  }
}

export async function chooseDirection(
  deps: DesignDeps,
  plan: AppPlan,
  research: ResearchBrief | null,
): Promise<DesignDirection> {
  const { value } = await structured<unknown>(deps, {
    model: deps.directionModel,
    system: designSystem(plan),
    content: [{ type: "text", text: designRequest(plan, research) }],
    schema: DESIGN_DIRECTION_JSON_SCHEMA,
    maxTokens: 16_000,
  });
  return normalizeDirection(value, plan);
}

export interface DrawnPose {
  name: string;
  /** The transparent PNG the app shows. */
  png: Buffer;
}

/**
 * The first pose is drawn from the description (or from the current character when redrawing);
 * the others are drawn from the first so it stays the same character.
 */
export async function drawMascot(
  deps: DesignDeps,
  plan: AppPlan,
  direction: DesignDirection,
  options: { note?: string; current?: Buffer } = {},
): Promise<DrawnPose[]> {
  const poses = direction.mascot?.poses ?? [];
  if (!poses.length) return [];
  const first = await draw(deps, {
    prompt: mascotPosePrompt(plan, direction, poses[0]!, Boolean(options.current), options.note),
    refs: options.current ? [options.current] : [],
    aspect: "1:1",
  });
  const rest = await Promise.all(
    poses.slice(1).map((pose) =>
      draw(deps, {
        prompt: mascotPosePrompt(plan, direction, pose, true),
        refs: [first.data],
        aspect: "1:1",
      }),
    ),
  );
  return Promise.all(
    [first, ...rest].map(async (image, i) => ({
      name: poses[i]!.name,
      png: await cutOutCharacter(image.data),
    })),
  );
}

/** Claude picks the stronger of two options for the key screen (1 or 2). */
export async function pickKeyScreen(
  deps: DesignDeps,
  brief: string,
  direction: DesignDirection,
  a: Buffer,
  b: Buffer,
): Promise<{ winner: 1 | 2; why: string }> {
  const { value } = await structured<{ winner?: number; why?: string }>(deps, {
    model: deps.reviewModel,
    system: RATE_SYSTEM,
    content: [
      { type: "text", text: rateRequest(brief, `${direction.styleName}: ${direction.summary}`) },
      imageBlock(a),
      imageBlock(b),
    ],
    schema: RATE_JSON_SCHEMA,
  });
  return { winner: value.winner === 2 ? 2 : 1, why: String(value.why ?? "").slice(0, 400) };
}

/** What to fix in a mockup before the user sees it (empty: nothing). */
export async function checkMockup(
  deps: DesignDeps,
  key: Buffer,
  mockup: Buffer,
): Promise<string[]> {
  const { value } = await structured<{
    phoneFrame?: boolean;
    multipleScreens?: boolean;
    leakedText?: string[];
    problems?: string[];
  }>(deps, {
    model: deps.reviewModel,
    system: CHECK_SYSTEM,
    content: [{ type: "text", text: CHECK_REQUEST }, imageBlock(key), imageBlock(mockup)],
    schema: CHECK_JSON_SCHEMA,
  });
  const fixes: string[] = [];
  if (value.phoneFrame)
    fixes.push(
      "Remove the phone frame, bezel, notch and any background around it: the app screen must fill the whole image edge to edge, keeping the iOS status bar at the top.",
    );
  if (value.multipleScreens)
    fixes.push(
      "Show only ONE screen, the most complete one, filling the whole image; remove the other screens.",
    );
  const leaked = (value.leakedText ?? []).filter(Boolean).slice(0, 6);
  if (leaked.length)
    fixes.push(
      `Remove these design-note texts (replace them with nothing or natural UI copy): ${leaked.map((t) => `"${t}"`).join(", ")}.`,
    );
  const problems = (value.problems ?? []).filter(Boolean).slice(0, 3);
  if (problems.length) fixes.push(`Fix: ${problems.join("; ")}.`);
  return fixes;
}

/** Check a mockup and, when something's wrong, fix it with one edit. */
export async function checkAndFix(
  deps: DesignDeps,
  key: Buffer,
  mockup: DrawnImage,
): Promise<DrawnImage> {
  const fixes = await checkMockup(deps, key, mockup.data);
  if (!fixes.length) return mockup;
  return draw(deps, { prompt: fixMockupPrompt(fixes), refs: [mockup.data], aspect: "9:16" });
}
