import { decryptSecret, encryptSecret, type PendingAuthorization } from "@appbuilder/core";
import { appOrigin } from "@/lib/auth";

/**
 * A connector sign-in in flight lives in an encrypted cookie scoped to the callback, so nothing
 * is stored until the user comes back with a code.
 */
export const PENDING_COOKIE = "connector_oauth";
const MAX_AGE_S = 600;

export const connectorRedirectUri = () => `${appOrigin}/api/connectors/callback`;

export function sealPending(pending: PendingAuthorization): string {
  return encryptSecret(JSON.stringify({ ...pending, at: Date.now() }));
}

export function openPending(value: string | undefined): PendingAuthorization | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(decryptSecret(value)) as PendingAuthorization & { at: number };
    return Date.now() - parsed.at < MAX_AGE_S * 1000 ? parsed : null;
  } catch {
    return null;
  }
}

export const pendingCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: appOrigin.startsWith("https://"),
  path: "/api/connectors/callback",
  maxAge: MAX_AGE_S,
};

/** Only paths on the builder itself, never another site. */
export function safeReturnTo(value: string | null): string {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/settings";
}

/** returnTo with a query parameter added and the Connectors section in view. */
export function backTo(returnTo: string, key: string, value: string): string {
  const url = new URL(returnTo, appOrigin);
  url.searchParams.set(key, value);
  if (url.pathname === "/settings") url.hash = "connectors";
  return `${url.pathname}${url.search}${url.hash}`;
}
