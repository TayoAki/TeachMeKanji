import { describe, expect, it } from "vitest";
import { instrumentForSelection, parseFid } from "./instrument";

describe("instrumentForSelection", () => {
  const source = `import { View, Text } from "react-native";
import { Card } from "../components/Card";
export default function S() {
  return (
    <View style={{ flex: 1 }}>
      <Text>Hello</Text>
      <Card />
    </View>
  );
}`;

  it("tags react-native elements with their exact source span", () => {
    const out = instrumentForSelection("app/s.tsx", source);
    const fids = [...out.matchAll(/fid: "([^"]+)"/g)].map((m) => parseFid(m[1]!)!);
    expect(fids).toHaveLength(2);
    expect(source.slice(fids[0]!.start, fids[0]!.end)).toMatch(/^<View[\s\S]*<\/View>$/);
    expect(source.slice(fids[1]!.start, fids[1]!.end)).toBe("<Text>Hello</Text>");
  });

  it("does not tag custom components", () => {
    expect(instrumentForSelection("app/s.tsx", source)).toContain("<Card />");
  });

  it("returns the source unchanged when it does not parse", () => {
    expect(instrumentForSelection("app/s.tsx", "<<<")).toBe("<<<");
  });
});
