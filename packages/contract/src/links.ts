// Links in generated code must open a screen that exists: a typo ("/protocols/new" for
// app/protocol/[id].tsx) shows "Unmatched route" on a phone and passes every other check.
import type { Node } from "@babel/types";
import { walk } from "./parse";
import { hrefFor, matchRoute, screens, type LayoutRoute } from "./routes";

/** Stands in for a `${...}` part of a template-literal link: it could be any value. */
const ANY = "\u0000";
const GROUP = /^\(.*\)$/;
const NAVIGATE = new Set(["push", "replace", "navigate"]);
const LINK_ELEMENTS = new Set(["Link", "Redirect"]);

export interface Link {
  href: string;
  line?: number;
}

/** The text of a literal link, with ANY for interpolated parts; null when it isn't literal. */
function literal(node: Node | null | undefined): string | null {
  if (!node) return null;
  if (node.type === "StringLiteral") return node.value;
  if (node.type === "TemplateLiteral") {
    const parts = node.quasis.map((q) => q.value.cooked ?? q.value.raw);
    if (!parts[0]) return null; // starts with a value: can't tell where it goes
    return parts.join(ANY);
  }
  if (node.type === "ObjectExpression") {
    for (const property of node.properties) {
      if (property.type !== "ObjectProperty") continue;
      const key = property.key;
      const name =
        key.type === "Identifier" ? key.name : key.type === "StringLiteral" ? key.value : "";
      if (name === "pathname") return literal(property.value as Node);
    }
  }
  return null;
}

/** Absolute links a file opens: router.push/replace/navigate, <Link href>, <Redirect href>. */
export function collectLinks(ast: Node): Link[] {
  const links: Link[] = [];
  const keep = (href: string | null, node: Node) => {
    if (href && href.startsWith("/") && !href.startsWith("//"))
      links.push({ href, line: node.loc?.start.line });
  };
  walk(ast, (node) => {
    if (
      node.type === "CallExpression" &&
      node.callee.type === "MemberExpression" &&
      node.callee.object.type === "Identifier" &&
      node.callee.object.name === "router" &&
      node.callee.property.type === "Identifier" &&
      NAVIGATE.has(node.callee.property.name)
    ) {
      keep(literal(node.arguments[0] as Node | undefined), node);
    }
    if (
      node.type === "JSXOpeningElement" &&
      node.name.type === "JSXIdentifier" &&
      LINK_ELEMENTS.has(node.name.name)
    ) {
      for (const attribute of node.attributes) {
        if (attribute.type !== "JSXAttribute" || attribute.name.name !== "href") continue;
        const value = attribute.value;
        const expression =
          value?.type === "JSXExpressionContainer" && value.expression.type !== "JSXEmptyExpression"
            ? (value.expression as Node)
            : (value as Node | null);
        keep(literal(expression), attribute);
      }
    }
  });
  return links;
}

/** Whether some screen can open at this link (interpolated parts match anything). */
export function linkOpensScreen(tree: LayoutRoute, href: string): boolean {
  const cut = href.search(/[?#]/);
  const pathname = cut === -1 ? href : href.slice(0, cut);
  const all = screens(tree);
  // A catch-all screen ([...rest]) opens paths of any length; don't guess about those apps.
  if (all.some(({ screen }) => /\[\.\.\./.test(screen.file))) return true;
  if (!pathname.includes(ANY)) return matchRoute(tree, href.split(ANY).join("x")) !== null;
  const parts = pathname
    .split("/")
    .filter(Boolean)
    .filter((p) => !GROUP.test(p));
  return all.some(
    ({ screen }) =>
      screen.pattern.length === parts.length &&
      screen.pattern.every(
        (segment, i) =>
          parts[i]!.includes(ANY) || segment.type === "param" || segment.value === parts[i],
      ),
  );
}

/** The app's screens as links, for messages: "/protocol/[id], /settings, ...". */
export function screenList(tree: LayoutRoute, limit = 24): string {
  const hrefs = screens(tree).map(({ screen }) =>
    hrefFor(
      screen,
      Object.fromEntries(
        screen.pattern.filter((s) => s.type === "param").map((s) => [s.name, `[${s.name}]`]),
      ),
    )
      .replace(/%5B/g, "[")
      .replace(/%5D/g, "]"),
  );
  const unique = [...new Set(hrefs)].sort();
  return unique.length > limit ? `${unique.slice(0, limit).join(", ")}, ...` : unique.join(", ");
}

/** Shows a link the way it was written, with ${...} for its interpolated parts. */
export function showLink(href: string): string {
  return href.split(ANY).join("${...}");
}
