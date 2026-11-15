/**
 * The invite link someone opened before they had an account. In factory mode (FACTORY_MODE=1)
 * new accounts need one: the proxy remembers the token when an invite page is opened, and
 * sign-up (email or Google) checks it is still a valid invite.
 */
export const INVITE_COOKIE = "ab_invite";

/** The invite token in a Cookie header, if any. */
export function inviteTokenFrom(cookieHeader: string | null | undefined): string | null {
  for (const part of (cookieHeader || "").split(";")) {
    const [name, ...value] = part.trim().split("=");
    if (name === INVITE_COOKIE) return decodeURIComponent(value.join("=")) || null;
  }
  return null;
}
