import type { Node } from "@babel/types";
import { DATA_LAYER_ONLY_MODULES, IMPORTABLE_MODULES } from "./allowed";
import {
  GENERATED_ROOTS,
  REQUIRED_GENERATED_FILES,
  TEMPLATE_FILES,
  TOKENS_FILE,
  isDataLayerFile,
  isLayoutFile,
  isScreenFile,
  isTemplateFile,
  type ProjectFiles,
} from "./layout";
import { collectImports, parseModule, walk } from "./parse";
import { transpile } from "./transpile";

export type Severity = "error" | "warning";

export interface Issue {
  path: string;
  rule: string;
  severity: Severity;
  message: string;
  line?: number;
}

const HEX_COLOR = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const COLOR_FUNCTION = /^(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/i;
const COLOR_KEY = /(?:^color$|Color$)/;
const ALLOWED_COLOR_KEYWORDS = new Set(["transparent"]);

export interface FileContext {
  /** All paths in the project, to check that relative imports resolve. */
  paths?: ReadonlySet<string>;
}

export function validateFile(path: string, source: string, context: FileContext = {}): Issue[] {
  const issues: Issue[] = [];
  const add = (rule: string, message: string, line?: number, severity: Severity = "error") =>
    issues.push({ path, rule, severity, message, line });

  if (!/\.(tsx?|json)$/.test(path))
    add("layout/extension", "Only .ts, .tsx and .json files are allowed.");
  if (!isTemplateFile(path) && !GENERATED_ROOTS.some((root) => path.startsWith(root))) {
    add("layout/root", `Generated files must live under ${GENERATED_ROOTS.join(", ")}.`);
  }
  if (path.endsWith(".json")) return issues;

  const parsed = parseModule(source);
  if (!parsed.ok) {
    add("syntax", parsed.message, parsed.line);
    return issues;
  }
  const transpiled = transpile(path, source);
  if (!transpiled.ok) add("transpile", transpiled.message);

  const { ast } = parsed;

  for (const imp of collectImports(ast)) {
    if (imp.source.startsWith(".")) {
      if (context.paths && !resolveRelative(path, imp.source, context.paths)) {
        add("imports/relative", `Cannot resolve "${imp.source}" from ${path}.`, imp.line);
      }
      continue;
    }
    const allowed = IMPORTABLE_MODULES[imp.source];
    if (allowed === undefined) {
      add(
        "imports/module",
        `"${imp.source}" is not an allowed module. Allowed: ${Object.keys(IMPORTABLE_MODULES).join(", ")}.`,
        imp.line,
      );
      continue;
    }
    if (DATA_LAYER_ONLY_MODULES.has(imp.source) && !isDataLayerFile(path)) {
      add(
        "imports/data-layer-only",
        `"${imp.source}" may only be used in data/. Read and write data with useCollection() from data/repo.`,
        imp.line,
      );
    }
    if (allowed !== "*") {
      for (const imported of imp.bindings.values()) {
        if (!allowed.includes(imported)) {
          add(
            "imports/named",
            `"${imported}" from "${imp.source}" is not allowed. Allowed: ${allowed.join(", ")}.`,
            imp.line,
          );
        }
      }
    }
  }

  if (path !== TOKENS_FILE) {
    walk(ast, (node) => {
      if (node.type === "StringLiteral") {
        if (HEX_COLOR.test(node.value) || COLOR_FUNCTION.test(node.value)) {
          add(
            "style/no-color-literal",
            `Color literal "${node.value}" found. Use a theme token from useTheme() instead.`,
            node.loc?.start.line,
          );
        }
        return;
      }
      let keyName: string | null = null;
      let value: Node | null | undefined;
      if (node.type === "ObjectProperty" && node.key.type === "Identifier") {
        keyName = node.key.name;
        value = node.value;
      } else if (node.type === "JSXAttribute" && node.name.type === "JSXIdentifier") {
        keyName = node.name.name;
        value = node.value;
      }
      if (!keyName || !COLOR_KEY.test(keyName)) return;
      if (
        value?.type === "StringLiteral" &&
        !HEX_COLOR.test(value.value) &&
        !COLOR_FUNCTION.test(value.value) &&
        !ALLOWED_COLOR_KEYWORDS.has(value.value)
      ) {
        add(
          "style/no-color-literal",
          `Named color "${value.value}" for ${keyName}. Use a theme token from useTheme() instead.`,
          value.loc?.start.line,
        );
      }
    });
  }

  if (isScreenFile(path) || isLayoutFile(path)) {
    const hasDefault = ast.program.body.some((s) => s.type === "ExportDefaultDeclaration");
    if (!hasDefault)
      add("screen/default-export", "Screens and layouts must have a default export.");
  }

  if (!isDataLayerFile(path)) {
    walk(ast, (node) => {
      if (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        node.callee.name === "fetch"
      ) {
        add(
          "data/no-direct-fetch",
          "Screens and components should load data through useCollection(), not fetch().",
          node.loc?.start.line,
          "warning",
        );
      }
    });
  }

  return issues;
}

export function validateProject(files: ProjectFiles): Issue[] {
  const paths = new Set(Object.keys(files));
  const issues: Issue[] = [];
  for (const required of [...TEMPLATE_FILES, ...REQUIRED_GENERATED_FILES]) {
    if (!paths.has(required)) {
      issues.push({
        path: required,
        rule: "project/required-file",
        severity: "error",
        message: `Missing required file ${required}.`,
      });
    }
  }
  for (const [path, source] of Object.entries(files)) {
    issues.push(...validateFile(path, source, { paths }));
  }
  return issues;
}

export function hasErrors(issues: readonly Issue[]): boolean {
  return issues.some((issue) => issue.severity === "error");
}

export function formatIssues(issues: readonly Issue[]): string {
  return issues
    .map(
      (i) =>
        `${i.severity.toUpperCase()} ${i.path}${i.line ? `:${i.line}` : ""} [${i.rule}] ${i.message}`,
    )
    .join("\n");
}

/** Resolve a relative import the way Metro would for our file layout. */
export function resolveRelative(
  fromPath: string,
  specifier: string,
  paths: ReadonlySet<string>,
): string | null {
  const base = joinPath(dirname(fromPath), specifier);
  const candidates = [base, `${base}.tsx`, `${base}.ts`, `${base}/index.tsx`, `${base}/index.ts`];
  return candidates.find((c) => paths.has(c)) ?? null;
}

function dirname(path: string): string {
  const index = path.lastIndexOf("/");
  return index === -1 ? "" : path.slice(0, index);
}

function joinPath(dir: string, relative: string): string {
  const parts = dir ? dir.split("/") : [];
  for (const segment of relative.split("/")) {
    if (segment === "." || segment === "") continue;
    if (segment === "..") parts.pop();
    else parts.push(segment);
  }
  return parts.join("/");
}
