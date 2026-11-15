import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type Anthropic from "@anthropic-ai/sdk";
import { loadProject } from "@appbuilder/contract/node";
import { REPO_ROOT } from "../project";
import type { CreateMessage } from "./client";
import { generateFiles } from "./generate-files";

function reply(
  text: string,
  stop: "end_turn" | "max_tokens" = "end_turn",
): Anthropic.Beta.Messages.BetaMessage {
  return {
    id: "msg_test",
    type: "message",
    role: "assistant",
    model: "test",
    content: [{ type: "text", text, citations: null }],
    stop_reason: stop,
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

describe("generateFiles with a long answer", () => {
  it("keeps the files finished before the answer was cut off and continues with the rest", async () => {
    const base = await loadProject(
      join(REPO_ROOT, "templates/expo-app"),
      join(REPO_ROOT, "fixtures/habit-tracker"),
    );
    const screen = (name: string) => SCREEN.replace(/About/g, name);
    const replies = [
      // Two complete files, then the answer stops in the middle of the third.
      reply(
        `<file path="app/about.tsx">\n${screen("About")}</file>\n<file path="app/help.tsx">\n${screen("Help")}</file>\n<file path="app/faq.tsx">\nimport { Text } from "react-nat`,
        "max_tokens",
      ),
      // The continuation rewrites the unfinished file whole, adds the last one and the summary.
      reply(
        `<file path="app/faq.tsx">\n${screen("Faq")}</file>\n<file path="app/contact.tsx">\n${screen("Contact")}</file>\n<summary>Added four screens.</summary>`,
      ),
    ];
    const requests: string[] = [];
    const createMessage: CreateMessage = async (params) => {
      requests.push(JSON.stringify(params.messages));
      return replies.shift()!;
    };
    const result = await generateFiles({
      createMessage,
      system: [{ type: "text", text: "system" }],
      request: "Add four screens",
      baseFiles: base,
    });
    expect(result.ok).toBe(true);
    expect(Object.keys(result.files).sort()).toEqual([
      "app/about.tsx",
      "app/contact.tsx",
      "app/faq.tsx",
      "app/help.tsx",
    ]);
    expect(result.files["app/faq.tsx"]).toContain("export default function Faq");
    expect(result.summary).toBe("Added four screens.");
    // The model was told which files were already complete.
    expect(requests[1]).toContain("cut off");
    expect(requests[1]).toContain("app/about.tsx, app/help.tsx");
  });

  it("stops when the answer keeps getting cut off", async () => {
    const base = await loadProject(
      join(REPO_ROOT, "templates/expo-app"),
      join(REPO_ROOT, "fixtures/habit-tracker"),
    );
    const createMessage: CreateMessage = async () =>
      reply(`<file path="app/x.tsx">\nimport`, "max_tokens");
    await expect(
      generateFiles({
        createMessage,
        system: [{ type: "text", text: "system" }],
        request: "Huge",
        baseFiles: base,
      }),
    ).rejects.toThrow();
  });
});
