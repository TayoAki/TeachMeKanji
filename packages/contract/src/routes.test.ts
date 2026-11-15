import { describe, expect, it } from "vitest";
import { buildRouteTree, hrefFor, matchRoute, normalizeHref, pathnameOf, screens } from "./routes";

const paths = [
  "app/_layout.tsx",
  "app/(tabs)/_layout.tsx",
  "app/(tabs)/index.tsx",
  "app/(tabs)/stats.tsx",
  "app/habit/[id].tsx",
  "app/add-habit.tsx",
  "components/Card.tsx",
];

describe("route tree", () => {
  const tree = buildRouteTree(paths);

  it("nests layouts and flattens layout-less directories", () => {
    expect(tree.file).toBe("app/_layout.tsx");
    expect(tree.children.map((c) => `${c.kind}:${c.name}`)).toEqual([
      "screen:add-habit",
      "layout:(tabs)",
      "screen:habit/[id]",
    ]);
    const tabs = tree.children.find((c) => c.kind === "layout");
    expect(tabs?.kind === "layout" && tabs.children.map((c) => c.name)).toEqual(["index", "stats"]);
  });

  it("matches URLs to screens with their layout chain and params", () => {
    const home = matchRoute(tree, "/");
    expect(home?.screen.file).toBe("app/(tabs)/index.tsx");
    expect(home?.layouts.map((l) => l.name)).toEqual(["", "(tabs)"]);

    const detail = matchRoute(tree, "/habit/h2?from=today");
    expect(detail?.screen.file).toBe("app/habit/[id].tsx");
    expect(detail?.params).toEqual({ id: "h2", from: "today" });

    expect(matchRoute(tree, "/nope")).toBeNull();
  });

  it("accepts groups in an href, as expo-router does: they only pick the screen inside them", () => {
    expect(matchRoute(tree, "/(tabs)/stats")?.screen.file).toBe("app/(tabs)/stats.tsx");
    expect(matchRoute(tree, "/(tabs)")?.screen.file).toBe("app/(tabs)/index.tsx");
    expect(matchRoute(tree, "/(tabs)/stats?range=week")?.params).toEqual({ range: "week" });
    // A group the screen isn't in matches nothing.
    expect(matchRoute(tree, "/(auth)/stats")).toBeNull();
    expect(matchRoute(tree, "/(tabs)/add-habit")).toBeNull();
    // The path an app reads has no groups, like usePathname() on a phone.
    expect(pathnameOf("/(tabs)/stats?range=week")).toBe("/stats");
    expect(pathnameOf("/(tabs)")).toBe("/");
  });

  it("builds hrefs from screens and href objects", () => {
    const detail = screens(tree).find((s) => s.screen.name === "habit/[id]")!.screen;
    expect(hrefFor(detail, { id: "h1" })).toBe("/habit/h1");
    expect(normalizeHref({ pathname: "/habit/[id]", params: { id: "h1", tab: "x" } })).toBe(
      "/habit/h1?tab=x",
    );
  });
});
