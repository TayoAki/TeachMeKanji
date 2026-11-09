import type Anthropic from "@anthropic-ai/sdk";
import { describe, expect, it } from "vitest";
import { fixtureProject } from "../project";
import type { CreateMessage } from "./client";
import { generateFile, GenerationStopped } from "./generate-file";
import { contractRules, extractCode } from "./prompt";

type Params = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming;

function reply(
  text: string,
  stop: Anthropic.Beta.Messages.BetaMessage["stop_reason"] = "end_turn",
) {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "claude-opus-5-5",
    content: [{ type: "text", text, citations: null }],
    stop_reason: stop,
    stop_sequence: null,
    stop_details: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 0,
    },
  } as unknown as Anthropic.Beta.Messages.BetaMessage;
}

function scripted(...texts: string[]) {
  const calls: Params[] = [];
  const createMessage: CreateMessage = async (params) => {
    calls.push(structuredClone(params));
    const text = texts[calls.length - 1];
    if (text === undefined) throw new Error("unexpected extra call");
    return reply(text);
  };
  return { createMessage, calls };
}

const GOOD = `import { Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";
export default function Insights() {
  const theme = useTheme();
  return <View><Text style={{ color: theme.colors.text }}>Insights</Text></View>;
}`;

const BAD = GOOD.replace("theme.colors.text", '"#ff0000"');

describe("generateFile", () => {
  it("returns valid code from the first attempt", async () => {
    const files = await fixtureProject();
    const { createMessage, calls } = scripted("```tsx\n" + GOOD + "\n```");
    const result = await generateFile({
      createMessage,
      files,
      spec: { path: "app/(tabs)/insights.tsx", purpose: "x" },
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(1);
    expect(result.code).toBe(GOOD + "\n");
    expect(calls[0]!.system).toHaveLength(2);
    expect((calls[0]!.system as Array<{ cache_control?: unknown }>)[1]!.cache_control).toEqual({
      type: "ephemeral",
    });
  });

  it("feeds validator errors back and keeps the conversation append-only", async () => {
    const files = await fixtureProject();
    const { createMessage, calls } = scripted(BAD, GOOD);
    const result = await generateFile({
      createMessage,
      files,
      spec: { path: "app/(tabs)/insights.tsx", purpose: "x" },
    });

    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(result.usage).toEqual({ input: 200, output: 100, cacheRead: 1800, cacheWrite: 0 });
    const second = calls[1]!.messages;
    expect(second).toHaveLength(3);
    expect(second.slice(0, 1)).toEqual(calls[0]!.messages); // earlier turns unchanged
    expect(second[1]!.role).toBe("assistant");
    expect(String(second[2]!.content)).toContain("style/no-color-literal");
  });

  it("gives up after the repair budget and reports the remaining issues", async () => {
    const files = await fixtureProject();
    const { createMessage } = scripted(BAD, BAD, BAD);
    const result = await generateFile({
      createMessage,
      files,
      spec: { path: "app/(tabs)/insights.tsx", purpose: "x" },
    });
    expect(result.ok).toBe(false);
    expect(result.attempts).toBe(3);
    expect(result.issues.map((i) => i.rule)).toContain("style/no-color-literal");
  });

  it("stops on truncated or refused output instead of validating it", async () => {
    const files = await fixtureProject();
    const createMessage: CreateMessage = async () => reply("partial", "max_tokens");
    await expect(
      generateFile({ createMessage, files, spec: { path: "app/x.tsx", purpose: "x" } }),
    ).rejects.toBeInstanceOf(GenerationStopped);
  });
});

describe("prompt", () => {
  it("lists exactly the modules the validator allows", () => {
    const rules = contractRules();
    expect(rules).toContain("@expo/vector-icons (only: Ionicons)");
    expect(rules).toContain("Expo SDK 58");
  });

  it("strips markdown fences", () => {
    expect(extractCode("```tsx\nconst a = 1;\n```")).toBe("const a = 1;\n");
    expect(extractCode("const a = 1;")).toBe("const a = 1;\n");
  });
});
