/**
 * The plain-text protocol the model uses to write several files in one response:
 *
 *   <summary>One or two sentences for the user.</summary>
 *   <file path="app/(tabs)/index.tsx">
 *   ...complete file contents...
 *   </file>
 *   <delete path="app/old.tsx" />
 *
 * Plain text (not JSON) keeps code unescaped and lets us count lines while streaming.
 */
export interface FileBlocks {
  files: Record<string, string>;
  deletes: string[];
  summary: string | null;
}

const FILE_BLOCK = /<file\s+path="([^"]+)"\s*>\n?([\s\S]*?)\n?<\/file>/g;
const DELETE_TAG = /<delete\s+path="([^"]+)"\s*\/?>/g;
const SUMMARY = /<summary>([\s\S]*?)<\/summary>/;

export function parseFileBlocks(text: string): FileBlocks {
  const files: Record<string, string> = {};
  for (const match of text.matchAll(FILE_BLOCK)) {
    files[normalizePath(match[1]!)] = stripFences(match[2]!).trimEnd() + "\n";
  }
  const deletes = [...text.matchAll(DELETE_TAG)].map((m) => normalizePath(m[1]!));
  const summary = SUMMARY.exec(text)?.[1]?.trim() ?? null;
  return { files, deletes, summary };
}

export function formatFileBlocks(files: Record<string, string>): string {
  return Object.entries(files)
    .map(([path, content]) => `<file path="${path}">\n${content.trimEnd()}\n</file>`)
    .join("\n\n");
}

function normalizePath(path: string): string {
  return path.trim().replace(/^\.?\/+/, "");
}

function stripFences(content: string): string {
  const fenced = /^\s*```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/.exec(content);
  return fenced ? fenced[1]! : content;
}
