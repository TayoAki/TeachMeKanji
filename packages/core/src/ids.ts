import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";

/** URL-safe random id, e.g. "p_k3j9x2m4q8w1". */
export function newId(prefix: string, length = 14): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length];
  return `${prefix}_${out}`;
}
