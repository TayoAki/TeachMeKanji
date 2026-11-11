/**
 * Research an app idea on the web before planning it: Claude with Anthropic's web search tool
 * (competitors, what their users love and complain about), condensed for the planner.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { normalizeResearch, type ResearchBrief } from "@appbuilder/contract";
import { addUsage, textOf, type CreateMessage, type UsageTotals } from "../generation/client";
import { BudgetExceeded, Cancelled } from "../llm";
import { RESEARCH_SYSTEM, researchRequest } from "./prompts";

export const RESEARCH_MODEL = () => process.env.RESEARCH_MODEL || "claude-sonnet-5-5";

/** Pull the first JSON object out of a reply (models sometimes add a sentence or a fence). */
export function firstJson(text: string): unknown {
  const fenced = /```(?:json)?\s*([\s\S]*?)```/.exec(text);
  const raw = fenced ? fenced[1]! : text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * Research never blocks planning: when the search or the answer fails, the plan is made from
 * the idea alone (null research), exactly as before.
 */
export async function researchIdea(input: {
  createMessage: CreateMessage;
  idea: string;
  model?: string;
}): Promise<{ research: ResearchBrief | null; usage: UsageTotals }> {
  let usage: UsageTotals = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const model = input.model ?? RESEARCH_MODEL();
  const messages: Anthropic.Beta.Messages.BetaMessageParam[] = [
    { role: "user", content: researchRequest(input.idea) },
  ];
  try {
    // A long search can pause; send the paused turn back so the server continues it.
    for (let turn = 0; turn < 4; turn++) {
      const response = await input.createMessage({
        model,
        max_tokens: 8000,
        system: RESEARCH_SYSTEM,
        tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 5 }],
        messages,
      });
      usage = addUsage(usage, response);
      if (response.stop_reason === "pause_turn") {
        messages.push({ role: "assistant", content: response.content });
        continue;
      }
      if (response.stop_reason !== "end_turn") break;
      return { research: normalizeResearch(firstJson(textOf(response))), usage };
    }
  } catch (error) {
    // Budget and cancellation must still stop the run.
    if (error instanceof BudgetExceeded || error instanceof Cancelled) throw error;
  }
  return { research: null, usage };
}
