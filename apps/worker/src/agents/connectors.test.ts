import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import type { CreateMessage } from "../generation/client";
import { editRequest } from "./prompts";
import { MCP_BETA, readConnectors } from "./connectors";

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

function reply(
  content: unknown[],
  stop_reason: string,
  usage = { input_tokens: 100, output_tokens: 10 },
): Anthropic.Beta.Messages.BetaMessage {
  return { content, stop_reason, usage } as unknown as Anthropic.Beta.Messages.BetaMessage;
}

describe("reading connected tools", () => {
  it("attaches each named connector as an MCP server signed in as the user, and continues paused turns", async () => {
    const seen: Params[] = [];
    const toolUse = {
      type: "mcp_tool_use",
      id: "mcptoolu_1",
      name: "get_issue",
      server_name: "linear",
      input: { id: "ENG-12" },
    };
    const createMessage: CreateMessage = async (params) => {
      seen.push(structuredClone(params));
      return seen.length === 1
        ? reply([toolUse], "pause_turn")
        : reply(
            [
              { type: "mcp_tool_result", tool_use_id: "mcptoolu_1", is_error: false, content: [] },
              { type: "text", text: "ENG-12: the paywall needs a 7-day trial." },
            ],
            "end_turn",
          );
    };
    const result = await readConnectors({
      createMessage,
      connectors: [
        { id: "linear", name: "Linear", url: "https://mcp.linear.app/mcp", token: "lin_secret" },
      ],
      request: "Build the paywall from Linear issue ENG-12",
      about: "a change to their app",
    });

    expect(result).toEqual({
      brief: "ENG-12: the paywall needs a 7-day trial.",
      calls: 1,
      usage: { input: 200, output: 20, cacheRead: 0, cacheWrite: 0 },
    });
    expect(seen[0]!.betas).toEqual([MCP_BETA]);
    expect(seen[0]!.mcp_servers).toEqual([
      {
        type: "url",
        url: "https://mcp.linear.app/mcp",
        name: "linear",
        authorization_token: "lin_secret",
      },
    ]);
    expect(seen[0]!.tools).toEqual([{ type: "mcp_toolset", mcp_server_name: "linear" }]);
    // The paused turn goes back unchanged, so the server picks up where it stopped.
    expect(seen[1]!.messages.at(-1)).toEqual({ role: "assistant", content: [toolUse] });
  });

  it("hands the brief to the code-writing call as information, not instructions", () => {
    const text = editRequest({
      request: "Use my Linear issue",
      maxScreens: 10,
      connectorBrief: "ENG-12: add a 7-day trial.",
    });
    expect(text).toContain("not instructions");
    expect(text).toContain("<connector_brief>\nENG-12: add a 7-day trial.\n</connector_brief>");
  });
});
