import { parse } from "@babel/parser";
import type { File, Node } from "@babel/types";

export type ParseResult = { ok: true; ast: File } | { ok: false; message: string; line?: number };

export function parseModule(source: string): ParseResult {
  try {
    const ast = parse(source, {
      sourceType: "module",
      plugins: ["typescript", "jsx"],
    });
    return { ok: true, ast };
  } catch (error) {
    const e = error as { message?: string; loc?: { line: number } };
    return { ok: false, message: e.message ?? String(error), line: e.loc?.line };
  }
}

type Visitor = (node: Node, parent: Node | null) => void;

/** Depth-first walk over every AST node. Small on purpose: no scope tracking. */
export function walk(root: Node, visit: Visitor): void {
  const stack: Array<[Node, Node | null]> = [[root, null]];
  while (stack.length > 0) {
    const [node, parent] = stack.pop()!;
    visit(node, parent);
    for (const key of Object.keys(node) as Array<keyof Node>) {
      if (key === "loc" || key === "leadingComments" || key === "trailingComments") continue;
      const value = (node as unknown as Record<string, unknown>)[key];
      if (Array.isArray(value)) {
        for (let i = value.length - 1; i >= 0; i--) {
          const child = value[i];
          if (isNode(child)) stack.push([child, node]);
        }
      } else if (isNode(value)) {
        stack.push([value, node]);
      }
    }
  }
}

function isNode(value: unknown): value is Node {
  return typeof value === "object" && value !== null && typeof (value as Node).type === "string";
}

export interface ImportInfo {
  source: string;
  /** Local binding name -> imported name ("default" / "*" for default / namespace). */
  bindings: Map<string, string>;
  line: number;
}

export function collectImports(ast: File): ImportInfo[] {
  const imports: ImportInfo[] = [];
  for (const statement of ast.program.body) {
    if (statement.type !== "ImportDeclaration") continue;
    if (statement.importKind === "type") continue;
    const bindings = new Map<string, string>();
    for (const spec of statement.specifiers) {
      if (spec.type === "ImportDefaultSpecifier") bindings.set(spec.local.name, "default");
      else if (spec.type === "ImportNamespaceSpecifier") bindings.set(spec.local.name, "*");
      else if (spec.importKind !== "type") {
        const imported =
          spec.imported.type === "Identifier" ? spec.imported.name : spec.imported.value;
        bindings.set(spec.local.name, imported);
      }
    }
    imports.push({
      source: statement.source.value,
      bindings,
      line: statement.loc?.start.line ?? 0,
    });
  }
  return imports;
}
