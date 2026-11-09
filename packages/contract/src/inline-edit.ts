import type { JSXElement, Node } from "@babel/types";
import MagicString from "magic-string";
import { parseModule, walk } from "./parse";

/**
 * Inline editing write-back (architecture §7): apply a quick-editor change to the exact JSX
 * element the user clicked, identified by its source span. Edits are surgical (magic-string),
 * so the rest of the file keeps its formatting.
 */
export type StyleValue =
  /** A theme token path, e.g. "colors.primary" or "spacing.md" -> `theme.colors.primary`. */
  | { kind: "token"; path: string }
  | { kind: "number"; value: number }
  | { kind: "keyword"; value: string };

export interface InlinePatch {
  text?: string;
  style?: Record<string, StyleValue>;
}

export class InlineEditError extends Error {}

const STYLE_KEY = /^[a-zA-Z]+$/;
const TOKEN_PATH = /^(colors|spacing|radius|font\.size|font\.weight)\.[a-zA-Z]+$/;
const KEYWORDS = new Set([
  "center",
  "flex-start",
  "flex-end",
  "space-between",
  "space-around",
  "stretch",
  "row",
  "column",
  "left",
  "right",
  "bold",
  "normal",
  "italic",
  "transparent",
  "hidden",
  "visible",
]);

function renderValue(value: StyleValue): string {
  if (value.kind === "token") {
    if (!TOKEN_PATH.test(value.path))
      throw new InlineEditError(`Unknown theme token ${value.path}`);
    return `theme.${value.path}`;
  }
  if (value.kind === "number") {
    if (!Number.isFinite(value.value) || Math.abs(value.value) > 2000)
      throw new InlineEditError("Invalid number");
    return String(Math.round(value.value * 100) / 100);
  }
  if (!KEYWORDS.has(value.value)) throw new InlineEditError(`Unsupported value ${value.value}`);
  return JSON.stringify(value.value);
}

function escapeJsxText(text: string): string {
  return text.replace(/[{}<>]/g, (c) => `{${JSON.stringify(c)}}`);
}

export function findElement(
  source: string,
  start: number,
  end: number,
): { element: JSXElement; ast: Node } {
  const parsed = parseModule(source);
  if (!parsed.ok) throw new InlineEditError("The file does not parse");
  let found: JSXElement | null = null;
  walk(parsed.ast, (node) => {
    if (node.type === "JSXElement" && node.start === start && node.end === end) found = node;
  });
  if (!found)
    throw new InlineEditError("The element changed since it was selected. Select it again.");
  return { element: found, ast: parsed.ast };
}

/** Whether the element's text is a plain literal the quick editor can change. */
export function literalText(element: JSXElement): string | null {
  const meaningful = element.children.filter(
    (c) => !(c.type === "JSXText" && c.value.trim() === ""),
  );
  if (meaningful.length !== 1 || meaningful[0]!.type !== "JSXText") return null;
  return meaningful[0]!.value.trim();
}

export function applyInlineEdit(
  source: string,
  span: { start: number; end: number },
  patch: InlinePatch,
): string {
  const { element } = findElement(source, span.start, span.end);
  const out = new MagicString(source);

  if (patch.text !== undefined) {
    const meaningful = element.children.filter(
      (c) => !(c.type === "JSXText" && c.value.trim() === ""),
    );
    const only = meaningful[0];
    if (meaningful.length !== 1 || !only || only.type !== "JSXText") {
      throw new InlineEditError(
        "This text is computed from data. Use “Edit with AI” to change it.",
      );
    }
    const leading = /^\s*/.exec(only.value)![0];
    const trailing = /\s*$/.exec(only.value)![0];
    out.overwrite(only.start!, only.end!, `${leading}${escapeJsxText(patch.text)}${trailing}`);
  }

  const entries = Object.entries(patch.style ?? {});
  if (entries.length > 0) {
    if (
      entries.some(([, v]) => v.kind === "token") &&
      !/\bconst\s+theme\s*=\s*useTheme\(\)/.test(source)
    ) {
      throw new InlineEditError("This file doesn't read the theme. Use “Edit with AI” instead.");
    }
    for (const [key] of entries)
      if (!STYLE_KEY.test(key)) throw new InlineEditError(`Invalid style property ${key}`);
    const rendered = entries.map(([k, v]) => [k, renderValue(v)] as const);
    const objectLiteral = `{ ${rendered.map(([k, v]) => `${k}: ${v}`).join(", ")} }`;

    const opening = element.openingElement;
    const styleAttr = opening.attributes.find(
      (a) =>
        a.type === "JSXAttribute" && a.name.type === "JSXIdentifier" && a.name.name === "style",
    );
    if (!styleAttr || styleAttr.type !== "JSXAttribute") {
      out.appendLeft(opening.name.end!, ` style={${objectLiteral}}`);
    } else if (
      styleAttr.value?.type !== "JSXExpressionContainer" ||
      styleAttr.value.expression.type === "JSXEmptyExpression"
    ) {
      throw new InlineEditError("Unsupported style attribute");
    } else {
      const expr = styleAttr.value.expression;
      if (expr.type === "ObjectExpression") {
        for (const [key, value] of rendered) {
          const prop = expr.properties.find(
            (p) => p.type === "ObjectProperty" && p.key.type === "Identifier" && p.key.name === key,
          );
          if (prop && prop.type === "ObjectProperty") {
            out.overwrite(prop.value.start!, prop.value.end!, value);
          } else {
            const last = expr.properties[expr.properties.length - 1];
            if (last) out.appendLeft(last.end!, `, ${key}: ${value}`);
            else out.overwrite(expr.start!, expr.end!, objectLiteral);
          }
        }
      } else if (expr.type === "ArrayExpression") {
        const last = expr.elements[expr.elements.length - 1];
        if (last) out.appendLeft(last.end!, `, ${objectLiteral}`);
        else out.overwrite(expr.start!, expr.end!, `[${objectLiteral}]`);
      } else {
        // style={someExpression} or a function style: put overrides after it.
        out.overwrite(
          expr.start!,
          expr.end!,
          `[${source.slice(expr.start!, expr.end!)}, ${objectLiteral}]`,
        );
      }
    }
  }
  return out.toString();
}
