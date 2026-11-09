import type { ProjectFiles } from "@appbuilder/contract";

// The rules and project context are shared with the MCP server, so they live in the contract.
export { contractRules, projectContext } from "@appbuilder/contract";

export const SINGLE_FILE_OUTPUT =
  "Output: respond with only the complete contents of the requested file. No explanations and no markdown code fences.";

export const FILE_BLOCKS_OUTPUT = `Output format: write each file as
<file path="relative/path.tsx">
complete file contents
</file>
with no markdown fences inside or around the blocks.`;

export interface FileSpec {
  path: string;
  purpose: string;
}

export function fileRequest(spec: FileSpec): string {
  return `Write the file \`${spec.path}\`.\n\nWhat it is for:\n${spec.purpose}`;
}

export function repairRequest(issueList: string): string {
  return `The file you wrote fails the platform's checks:\n\n${issueList}\n\nFix every issue and respond with the complete corrected file only.`;
}

/** Models sometimes wrap code in fences despite instructions; accept that. */
export function extractCode(text: string): string {
  const fenced = /^\s*```[a-zA-Z]*\n([\s\S]*?)\n```\s*$/.exec(text);
  return (fenced ? fenced[1]! : text).trim() + "\n";
}
