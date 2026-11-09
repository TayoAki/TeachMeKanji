import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { loadProject } from "@appbuilder/contract/node";
import { REPO_ROOT } from "../project";
import type { CreateMessage } from "./client";
import { generateFiles } from "./generate-files";

function reply(text: string): Anthropic.Beta.Messages.BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test",
    content: [{ type: "text", text, citations: null }],
    stop_reason: "end_turn",
    stop_sequence: null,
    usage: { input_tokens: 1, output_tokens: 1 },
  } as unknown as Anthropic.Beta.Messages.BetaMessage;
}

const SCREEN = `import { Text } from "react-native";
import { useTheme } from "../theme/ThemeProvider";

export default function About() {
  const theme = useTheme();
  return <Text style={{ color: theme.colors.text }}>About</Text>;
}
`;

describe("generateFiles scoping", () => {
  it("drops files outside the step's scope and asks for a repair", async () => {
    const base = await loadProject(
      join(REPO_ROOT, "templates/expo-app"),
      join(REPO_ROOT, "fixtures/habit-tracker"),
    );
    const replies = [
      // First answer also rewrites a shared component another parallel step relies on.
      `<file path="app/about.tsx">\n${SCREEN}</file>\n<file path="components/Card.tsx">\nexport const x = 1;\n</file>`,
      `<file path="app/about.tsx">\n${SCREEN}</file>`,
    ];
    const requests: string[] = [];
    const createMessage: CreateMessage = async (params) => {
      requests.push(JSON.stringify(params.messages));
      return reply(replies.shift()!);
    };
    const result = await generateFiles({
      createMessage,
      system: [{ type: "text", text: "system" }],
      request: "Write app/about.tsx",
      baseFiles: base,
      expectPaths: ["app/about.tsx"],
      allowWrite: {
        test: (path) => path === "app/about.tsx" || path.startsWith("components/about/"),
        describe: "app/about.tsx and components in components/about/ may be written",
      },
    });
    expect(result.ok).toBe(true);
    expect(result.attempts).toBe(2);
    expect(Object.keys(result.files)).toEqual(["app/about.tsx"]);
    expect(requests[1]).toContain("components/Card.tsx");
    expect(requests[1]).toContain("discarded");
  });
});
