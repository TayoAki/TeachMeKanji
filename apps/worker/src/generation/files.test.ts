import { describe, expect, it } from "vitest";
import { formatFileBlocks, parseFileBlocks } from "./files";

describe("file block protocol", () => {
  it("parses files, deletes and a summary", () => {
    const text = `<summary>Added a settings screen.</summary>
<file path="app/(tabs)/settings.tsx">
export default function Settings() {
  return null;
}
</file>
<file path="./components/Row.tsx">
\`\`\`tsx
export const Row = () => null;
\`\`\`
</file>
<delete path="app/old.tsx" />`;
    const parsed = parseFileBlocks(text);
    expect(parsed.summary).toBe("Added a settings screen.");
    expect(Object.keys(parsed.files)).toEqual(["app/(tabs)/settings.tsx", "components/Row.tsx"]);
    expect(parsed.files["components/Row.tsx"]).toBe("export const Row = () => null;\n");
    expect(parsed.deletes).toEqual(["app/old.tsx"]);
  });

  it("round-trips", () => {
    const files = { "a.ts": "export const a = 1;\n", "b/c.tsx": "export default () => null;\n" };
    expect(parseFileBlocks(formatFileBlocks(files)).files).toEqual(files);
  });
});
