import MagicString from "magic-string";
import { INSTRUMENTED_MODULES } from "./allowed";
import { fid } from "./fid";
import { collectImports, parseModule, walk } from "./parse";

/**
 * Element identity for click-to-select (architecture §2.4).
 *
 * Every JSX element whose tag is imported from an instrumented module (View, Text,
 * Pressable, Ionicons, ...) gets `dataSet={{ fid: "<path>:<start>-<end>" }}`, where
 * start/end are the element's character offsets in the *original* source. react-native-web
 * renders that as a `data-fid` attribute. The model never writes IDs, and an ID always
 * points at the exact source of the element in the version being previewed.
 */
export function instrumentForSelection(path: string, source: string): string {
  const parsed = parseModule(source);
  if (!parsed.ok) return source;

  const tagged = new Set<string>();
  for (const imp of collectImports(parsed.ast)) {
    if (!INSTRUMENTED_MODULES.has(imp.source)) continue;
    for (const local of imp.bindings.keys()) tagged.add(local);
  }
  if (tagged.size === 0) return source;

  const out = new MagicString(source);
  walk(parsed.ast, (node) => {
    if (node.type !== "JSXElement") return;
    const opening = node.openingElement;
    if (opening.name.type !== "JSXIdentifier" || !tagged.has(opening.name.name)) return;
    const hasDataSet = opening.attributes.some(
      (a) =>
        a.type === "JSXAttribute" && a.name.type === "JSXIdentifier" && a.name.name === "dataSet",
    );
    if (hasDataSet || node.start == null || node.end == null || opening.name.end == null) return;
    out.appendLeft(
      opening.name.end,
      ` dataSet={{ fid: ${JSON.stringify(fid(path, node.start, node.end))} }}`,
    );
  });
  return out.toString();
}

export { fid, parseFid } from "./fid";
