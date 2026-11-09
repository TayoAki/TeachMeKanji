import { describe, expect, it } from "vitest";
import { staticPath } from "../scripts/static";

describe("preview static server paths", () => {
  const root = "/srv/dist";

  it("serves files under the root, and index.html for /", () => {
    expect(staticPath(root, "/")).toBe("/srv/dist/index.html");
    expect(staticPath(root, "/runtime.js?v=1")).toBe("/srv/dist/runtime.js");
    expect(staticPath(root, "/fonts/Ionicons.ttf")).toBe("/srv/dist/fonts/Ionicons.ttf");
  });

  it("never leaves the root", () => {
    for (const url of ["/../etc/passwd", "/%2e%2e/%2e%2e/etc/passwd", "/a/../../x", "/..%2fx"]) {
      const file = staticPath(root, url);
      expect(file === null || file.startsWith("/srv/dist/")).toBe(true);
    }
  });

  it("rejects malformed escapes and NUL bytes instead of throwing", () => {
    expect(staticPath(root, "/%E0%A4%A")).toBeNull();
    expect(staticPath(root, "/index.html%00.js")).toBeNull();
  });
});
