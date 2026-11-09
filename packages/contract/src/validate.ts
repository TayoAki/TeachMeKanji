import type { Node } from "@babel/types";
import { DATA_LAYER_ONLY_MODULES, IMPORTABLE_MODULES } from "./allowed";
import { STRUCTURE_SCREENS } from "./app-structure";
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

  if (!isSafePath(path)) {
    add(
      "layout/path",
      `Unsafe file path "${path}". Use plain relative paths like app/(tabs)/index.tsx.`,
    );
    return issues;
  }
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

  // require() and import() would bypass the import allow-list.
  walk(ast, (node) => {
    const isRequire =
      node.type === "CallExpression" &&
      ((node.callee.type === "Identifier" && node.callee.name === "require") ||
        node.callee.type === "Import");
    if (isRequire || (node.type as string) === "ImportExpression") {
      add(
        "imports/dynamic",
        "Use static import statements only (no require() or import()).",
        node.loc?.start.line,
      );
    }
  });

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

  if (path === TOKENS_FILE) issues.push(...checkThemePacks(path, ast));

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
  issues.push(...validateStructureScreens(files));
  return issues;
}

/**
 * The structure screens must do their job when they exist (an app may drop one): onboarding
 * finishes through completeOnboarding(), and the paywall can buy, restore and be closed.
 */
export function validateStructureScreens(files: ProjectFiles): Issue[] {
  const issues: Issue[] = [];
  const need = (
    path: string,
    pattern: RegExp,
    rule: string,
    message: string,
    severity: Severity = "error",
  ) => {
    const source = files[path];
    if (source !== undefined && !pattern.test(source))
      issues.push({ path, rule, severity, message });
  };
  need(
    STRUCTURE_SCREENS.onboarding,
    /\bcompleteOnboarding\b/,
    "structure/onboarding-complete",
    "Onboarding must finish by calling completeOnboarding() from useAppState() (data/app-state).",
  );
  need(
    STRUCTURE_SCREENS.paywall,
    /\bpurchase\b/,
    "structure/paywall-purchase",
    "The paywall must let people buy: call purchase(offerId) from usePurchases() (data/purchases).",
  );
  need(
    STRUCTURE_SCREENS.paywall,
    /\brestorePurchases\b/,
    "structure/paywall-restore",
    "The paywall must have a Restore Purchases action: restorePurchases() from usePurchases().",
  );
  need(
    STRUCTURE_SCREENS.paywall,
    /\bdismissPaywall\b/,
    "structure/paywall-close",
    "The paywall must be closable: a close button that calls dismissPaywall() from usePurchases().",
  );
  need(
    STRUCTURE_SCREENS.paywall,
    /\b(privacyUrl|termsUrl)\b/,
    "structure/paywall-legal",
    "Show Terms and Privacy links on the paywall (appInfo.termsUrl and appInfo.privacyUrl).",
    "warning",
  );
  need(
    STRUCTURE_SCREENS.settings,
    /\brestorePurchases\b/,
    "structure/settings-restore",
    "Settings should show the subscription status with a Restore Purchases action.",
    "warning",
  );
  need(
    STRUCTURE_SCREENS.settings,
    /\bappInfo\b/,
    "structure/settings-info",
    "Settings should link support, privacy and terms and show the version (appInfo).",
    "warning",
  );
  return issues;
}

/**
 * Paths come from model output, so they are untrusted: no absolute paths, no "." or ".."
 * segments, no backslashes or control characters, and only ordinary file-name characters.
 */
export function isSafePath(path: string): boolean {
  if (path.length === 0 || path.length > 200) return false;
  if (!/^[A-Za-z0-9_\-()[\]./+@]+$/.test(path)) return false;
  const segments = path.split("/");
  return segments.every((s) => s.length > 0 && s !== "." && s !== "..");
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

/** Keys every theme pack's `colors` must define (mirrors templates/expo-app/theme/types.ts). */
export const THEME_COLOR_KEYS = [
  "background",
  "surface",
  "surfaceAlt",
  "border",
  "text",
  "textMuted",
  "primary",
  "onPrimary",
  "accent",
  "success",
  "warning",
  "danger",
] as const;

/**
 * theme/tokens.ts: every literal `colors: { ... }` object must define every key, or switching
 * to that pack would render undefined colors. Packs whose colors are not object literals
 * can't be checked statically and are left to the type checker.
 */
function checkThemePacks(path: string, ast: import("@babel/types").File): Issue[] {
  const issues: Issue[] = [];
  let packs = 0;
  walk(ast, (node) => {
    if (
      node.type !== "ObjectProperty" ||
      node.key.type !== "Identifier" ||
      node.key.name !== "colors"
    )
      return;
    if (node.value.type !== "ObjectExpression") return;
    packs += 1;
    const keys = new Set(
      node.value.properties.flatMap((p) =>
        p.type === "ObjectProperty" && p.key.type === "Identifier" ? [p.key.name] : [],
      ),
    );
    const missing = THEME_COLOR_KEYS.filter((k) => !keys.has(k));
    if (missing.length > 0) {
      issues.push({
        path,
        rule: "theme/missing-color-keys",
        severity: "error",
        message: `A theme pack's colors is missing: ${missing.join(", ")}.`,
        line: node.loc?.start.line,
      });
    }
  });
  if (packs > 0 && packs !== 5) {
    issues.push({
      path,
      rule: "theme/pack-count",
      severity: "error",
      message: `theme/tokens.ts must define exactly 5 theme packs (found ${packs}).`,
    });
  }
  return issues;
}
