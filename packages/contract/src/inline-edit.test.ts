import { describe, expect, it } from "vitest";
import { applyInlineEdit, InlineEditError } from "./inline-edit";
import { validateFile } from "./validate";

const source = `import { Text, View } from "react-native";
import { useTheme } from "../theme/ThemeProvider";
export default function S({ count }: { count: number }) {
  const theme = useTheme();
  return (
    <View style={[{ flex: 1 }, { padding: 4 }]}>
      <Text style={{ color: theme.colors.text, fontSize: 17 }}>Hello there</Text>
      <Text>{count} items</Text>
      <View />
    </View>
  );
}
`;

const span = (snippet: string) => {
  const start = source.indexOf(snippet);
  // find the element's end: snippet is a complete element in these tests
  return { start, end: start + snippet.length };
};

describe("applyInlineEdit", () => {
  it("replaces literal text and keeps everything else", () => {
    const el = `<Text style={{ color: theme.colors.text, fontSize: 17 }}>Hello there</Text>`;
    const out = applyInlineEdit(source, span(el), { text: "Hi <you>" });
    expect(out).toContain(`>Hi {"<"}you{">"}</Text>`);
    expect(out.replace(`Hi {"<"}you{">"}`, "Hello there")).toBe(source);
  });

  it("updates existing style props and appends new ones, using theme tokens", () => {
    const el = `<Text style={{ color: theme.colors.text, fontSize: 17 }}>Hello there</Text>`;
    const out = applyInlineEdit(source, span(el), {
      style: {
        color: { kind: "token", path: "colors.primary" },
        fontSize: { kind: "number", value: 22 },
        fontWeight: { kind: "keyword", value: "bold" },
      },
    });
    expect(out).toContain(
      `style={{ color: theme.colors.primary, fontSize: 22, fontWeight: "bold" }}`,
    );
    expect(validateFile("app/s.tsx", out).filter((i) => i.severity === "error")).toEqual([]);
  });

  it("appends overrides to style arrays and adds a style prop when missing", () => {
    const outer = source.slice(
      source.indexOf("<View style={["),
      source.lastIndexOf("</View>") + "</View>".length,
    );
    const withArray = applyInlineEdit(source, span(outer), {
      style: { backgroundColor: { kind: "token", path: "colors.surface" } },
    });
    expect(withArray).toContain(
      `style={[{ flex: 1 }, { padding: 4 }, { backgroundColor: theme.colors.surface }]}`,
    );
    const bare = applyInlineEdit(source, span("<View />"), {
      style: { padding: { kind: "token", path: "spacing.md" } },
    });
    expect(bare).toContain(`<View style={{ padding: theme.spacing.md }} />`);
  });

  it("refuses computed text, unknown tokens and stale spans", () => {
    expect(() =>
      applyInlineEdit(source, span("<Text>{count} items</Text>"), { text: "x" }),
    ).toThrow(InlineEditError);
    const el = `<Text style={{ color: theme.colors.text, fontSize: 17 }}>Hello there</Text>`;
    expect(() =>
      applyInlineEdit(source, span(el), {
        style: { color: { kind: "token", path: "colors.red; alert(1)" } },
      }),
    ).toThrow(InlineEditError);
    expect(() => applyInlineEdit(source, { start: 1, end: 5 }, { text: "x" })).toThrow(
      /Select it again/,
    );
  });
});
