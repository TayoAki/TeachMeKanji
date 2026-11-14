/**
 * The match check: after a build from approved mockups, each screen as the app renders it is
 * compared with its mockup by a vision model, which scores how closely it matches and lists the
 * gaps. Screens under the target are rebuilt with both pictures and the gaps (at most a few
 * rounds), so the app ends up looking like what the user approved.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { addUsage, textOf, type CreateMessage, type UsageTotals } from "../generation/client";
import { mediaTypeOf } from "../images/client";

/** A screen at or above this score is close enough to its mockup. */
export const MATCH_TARGET = Number(process.env.MATCH_TARGET) || 90;
/** Rebuild rounds after the first check. */
export const MATCH_ROUNDS = Math.max(0, Number(process.env.MATCH_ROUNDS ?? 2));

export interface MatchGap {
  issue: string;
  fix: string;
}

export interface ScreenMatch {
  score: number;
  gaps: MatchGap[];
  missingPictures: string[];
}

export const MATCH_SYSTEM = `You compare an app screen as built with the mockup the user approved. Be strict and concrete: name what differs and how to fix it in React Native terms.`;

export function matchRequest(title: string): string {
  return `Image 1 is the approved mockup of the "${title}" screen. Image 2 is the screen as the app renders it now (390pt wide, on a tall canvas, so it may show more or less below the fold than the mockup does).
These don't count as differences: the iOS status bar and home indicator; the image sizes; sample data, dates and numbers that differ but fit the same layout; a different step or state of the same screen (another onboarding step, another selected option); and the tab bar's tabs, whose number and names come from the app's plan (judge only their styling). Content the mockup shows further down than the build's canvas reaches isn't missing.
Score from 0 to 100 how closely the built screen matches the mockup's design: the same sections in the same order, hierarchy and sizes, colors and surfaces, type, pictures and mascot, controls and copy. 100: the same design. 90: only small differences. 75: the same structure with clear visual differences. 50 or less: largely different.
gaps: the differences that cost the most points, biggest first (at most 6), each with what differs (issue) and how to fix it in the code (fix).
missingPictures: pictures, illustrations or the mascot that the mockup shows but the build is missing or shows as an empty grey box, each as a short visual description.`;
}

export const MATCH_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "gaps", "missingPictures"],
  properties: {
    score: { type: "integer" },
    gaps: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["issue", "fix"],
        properties: { issue: { type: "string" }, fix: { type: "string" } },
      },
    },
    missingPictures: { type: "array", items: { type: "string" } },
  },
} as const;

const image = (data: Buffer): Anthropic.Beta.Messages.BetaImageBlockParam => ({
  type: "image",
  source: { type: "base64", media_type: mediaTypeOf(data), data: data.toString("base64") },
});

/** Score one built screen against its mockup. */
export async function compareScreen(input: {
  createMessage: CreateMessage;
  model: string;
  title: string;
  mockup: Buffer;
  shot: Buffer;
}): Promise<ScreenMatch & { usage: UsageTotals }> {
  const response = await input.createMessage({
    model: input.model,
    // Room for the model's thinking as well as the score and gaps (only what's used is billed).
    max_tokens: 16_000,
    output_config: {
      effort: "medium",
      format: {
        type: "json_schema",
        schema: MATCH_JSON_SCHEMA as unknown as Record<string, unknown>,
      },
    },
    system: MATCH_SYSTEM,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: matchRequest(input.title) },
          image(input.mockup),
          image(input.shot),
        ],
      },
    ],
  });
  const usage = addUsage({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, response);
  let raw: { score?: unknown; gaps?: unknown; missingPictures?: unknown } = {};
  try {
    raw = JSON.parse(textOf(response)) as typeof raw;
  } catch {
    // Unreadable answers count as unknown (scored 0, nothing to fix) rather than failing the build.
  }
  const score = Math.max(0, Math.min(100, Math.round(Number(raw.score) || 0)));
  const gaps = (Array.isArray(raw.gaps) ? raw.gaps : [])
    .map((g) => g as { issue?: unknown; fix?: unknown })
    .map((g) => ({
      issue: String(g.issue ?? "").slice(0, 300),
      fix: String(g.fix ?? "").slice(0, 300),
    }))
    .filter((g) => g.issue)
    .slice(0, 6);
  const missingPictures = (Array.isArray(raw.missingPictures) ? raw.missingPictures : [])
    .map((p) => String(p).slice(0, 200))
    .filter(Boolean)
    .slice(0, 3);
  return { score, gaps, missingPictures, usage };
}

/** The rebuild request for a screen that misses its mockup (images: mockup, then the build). */
export function fixRequest(input: {
  path: string;
  componentDir: string;
  match: ScreenMatch;
  imageNames: string[];
}): string {
  const { match } = input;
  return `Image 1 is the approved mockup of ${input.path}. Image 2 is how your build of it renders now; it matches the mockup about ${match.score}%. Change it so it matches the mockup:
${match.gaps.map((g) => `- ${g.issue} Fix: ${g.fix}`).join("\n")}${
    match.missingPictures.length
      ? `\nPictures it is missing: ${match.missingPictures.map((p) => `"${p}"`).join(", ")}. ${
          input.imageNames.length
            ? `Use one of the app's images where it fits (<AiImage name="..." fit="contain" /> for a character: ${input.imageNames.map((n) => `"${n}"`).join(", ")}); otherwise `
            : ""
        }show it with <AiImage prompt="the description" style={...} /> and the platform will draw it.`
      : ""
  }
Write ${input.path} again in full (and any component in ${input.componentDir} it needs). Keep its data, navigation and behavior, keep using components/motion, and leave out the status bar and home indicator.`;
}
