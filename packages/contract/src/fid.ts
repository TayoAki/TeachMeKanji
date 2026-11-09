/** Element ids for click-to-select: "<path>:<start>-<end>" (character offsets in the source). */
export function fid(path: string, start: number, end: number): string {
  return `${path}:${start}-${end}`;
}

export function parseFid(value: string): { path: string; start: number; end: number } | null {
  const match = /^(.*):(\d+)-(\d+)$/.exec(value);
  if (!match) return null;
  return { path: match[1]!, start: Number(match[2]), end: Number(match[3]) };
}
