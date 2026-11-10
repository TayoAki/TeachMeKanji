/**
 * The keys store submission needs, which users save in Settings (encrypted like other tokens):
 * an App Store Connect API key (TestFlight / App Store) and a Google Play service account key
 * (internal testing). Each is checked by authenticating with it before it's saved.
 */
import { createSign } from "node:crypto";

export interface AppStoreConnectKey {
  keyId: string;
  issuerId: string;
  teamId: string;
  teamType: "INDIVIDUAL" | "COMPANY_OR_ORGANIZATION" | "IN_HOUSE";
  /** The .p8 file's contents. */
  privateKey: string;
}

export interface PlayServiceAccount {
  type: "service_account";
  client_email: string;
  private_key: string;
  project_id?: string;
  [key: string]: unknown;
}

export class StoreKeyError extends Error {}

const b64url = (value: Buffer | string) => Buffer.from(value).toString("base64url");

export function parseAppStoreConnectKey(raw: string): AppStoreConnectKey {
  let parsed: Partial<AppStoreConnectKey>;
  try {
    parsed = JSON.parse(raw) as Partial<AppStoreConnectKey>;
  } catch {
    throw new StoreKeyError("That isn't a complete App Store Connect key.");
  }
  const key = {
    keyId: String(parsed.keyId ?? "").trim(),
    issuerId: String(parsed.issuerId ?? "").trim(),
    teamId: String(parsed.teamId ?? "").trim(),
    teamType: String(parsed.teamType ?? "COMPANY_OR_ORGANIZATION").trim(),
    privateKey: String(parsed.privateKey ?? "").trim(),
  };
  if (!/^[A-Z0-9]{8,12}$/.test(key.keyId))
    throw new StoreKeyError(
      "The key ID is the 10-character ID next to the key in App Store Connect.",
    );
  if (!/^[0-9a-f-]{36}$/i.test(key.issuerId))
    throw new StoreKeyError("The issuer ID is the UUID above the keys in App Store Connect.");
  if (!/^[A-Z0-9]{10}$/.test(key.teamId))
    throw new StoreKeyError(
      "The team ID is the 10-character ID in your Apple Developer membership.",
    );
  if (!["INDIVIDUAL", "COMPANY_OR_ORGANIZATION", "IN_HOUSE"].includes(key.teamType))
    throw new StoreKeyError("Choose whether the Apple team is an individual or an organization.");
  if (!/-----BEGIN PRIVATE KEY-----[\s\S]+-----END PRIVATE KEY-----/.test(key.privateKey))
    throw new StoreKeyError("Paste the whole .p8 file, including the BEGIN and END lines.");
  return key as AppStoreConnectKey;
}

export function parsePlayServiceAccount(raw: string): PlayServiceAccount {
  let parsed: Partial<PlayServiceAccount>;
  try {
    parsed = JSON.parse(raw) as Partial<PlayServiceAccount>;
  } catch {
    throw new StoreKeyError("Paste the service account's JSON key file.");
  }
  if (parsed.type !== "service_account" || !parsed.client_email || !parsed.private_key)
    throw new StoreKeyError(
      "That isn't a Google service account key (JSON with client_email and private_key).",
    );
  return parsed as PlayServiceAccount;
}

/** A short-lived token for the App Store Connect API (ES256). */
export function appStoreConnectToken(key: AppStoreConnectKey, now = Date.now()): string {
  const header = b64url(JSON.stringify({ alg: "ES256", kid: key.keyId, typ: "JWT" }));
  const iat = Math.floor(now / 1000);
  const payload = b64url(
    JSON.stringify({ iss: key.issuerId, iat, exp: iat + 600, aud: "appstoreconnect-v1" }),
  );
  const signature = createSign("SHA256")
    .update(`${header}.${payload}`)
    .sign({ key: key.privateKey, dsaEncoding: "ieee-p1363" });
  return `${header}.${payload}.${b64url(signature)}`;
}

/** true: Apple accepts the key; false: Apple refuses it; undefined: Apple couldn't be reached. */
export async function checkAppStoreConnectKey(
  key: AppStoreConnectKey,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | undefined> {
  let token: string;
  try {
    token = appStoreConnectToken(key);
  } catch {
    return false; // not a valid EC private key
  }
  try {
    const response = await fetchImpl("https://api.appstoreconnect.apple.com/v1/apps?limit=1", {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 401 || response.status === 403) return false;
    return response.ok ? true : undefined;
  } catch {
    return undefined;
  }
}

/** true: Google accepts the key; false: Google refuses it; undefined: Google couldn't be reached. */
export async function checkPlayServiceAccount(
  key: PlayServiceAccount,
  fetchImpl: typeof fetch = fetch,
): Promise<boolean | undefined> {
  const iat = Math.floor(Date.now() / 1000);
  let assertion: string;
  try {
    const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
    const payload = b64url(
      JSON.stringify({
        iss: key.client_email,
        scope: "https://www.googleapis.com/auth/androidpublisher",
        aud: "https://oauth2.googleapis.com/token",
        iat,
        exp: iat + 600,
      }),
    );
    const signature = createSign("RSA-SHA256").update(`${header}.${payload}`).sign(key.private_key);
    assertion = `${header}.${payload}.${b64url(signature)}`;
  } catch {
    return false;
  }
  try {
    const response = await fetchImpl("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
        assertion,
      }).toString(),
      signal: AbortSignal.timeout(10_000),
    });
    if (response.status === 400 || response.status === 401) return false;
    return response.ok ? true : undefined;
  } catch {
    return undefined;
  }
}
