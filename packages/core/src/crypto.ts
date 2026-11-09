import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

/**
 * Encryption for third-party tokens at rest (GitHub, Expo). AES-256-GCM with a key derived
 * from ENCRYPTION_KEY (falls back to BETTER_AUTH_SECRET in development).
 * Format: v1.<iv>.<tag>.<ciphertext> (base64url).
 */
function key(): Buffer {
  const secret = process.env.ENCRYPTION_KEY ?? process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("ENCRYPTION_KEY is not set");
  return createHash("sha256").update(`appbuilder:tokens:${secret}`).digest();
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return ["v1", iv, tag, data]
    .map((p) => (typeof p === "string" ? p : p.toString("base64url")))
    .join(".");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, data] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unrecognized secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(data, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function sha256(content: string | Buffer): string {
  return createHash("sha256").update(content).digest("hex");
}
