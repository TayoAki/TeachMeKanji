import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Circle, G, Path, Stop, Svg } from "./shims/svg";

describe("react-native-svg in the preview", () => {
  it("draws real SVG with react-native-svg's props translated", () => {
    const html = renderToStaticMarkup(
      h(
        Svg,
        { width: 120, height: 60, viewBox: "0 0 120 60" },
        h(
          G,
          { x: 10, y: 5 },
          h(Circle, {
            cx: 20,
            cy: 20,
            r: 18,
            stroke: "red",
            strokeWidth: 4,
            strokeDasharray: [4, 2],
            rotation: -90,
            origin: "20, 20",
            fill: "none",
          }),
        ),
        h(Path, { d: "M0 0 L10 10", onPress: () => {} }),
        h(Stop, { offset: "0.5", stopColor: "blue" }),
      ),
    );
    expect(html).toContain('viewBox="0 0 120 60"');
    expect(html).toContain('<g transform="translate(10 5)">');
    expect(html).toContain('stroke-dasharray="4 2"');
    expect(html).toContain('transform="rotate(-90 20 20)"');
    expect(html).toContain('stop-color="blue"');
    expect(html).toContain("cursor:pointer");
  });
});
