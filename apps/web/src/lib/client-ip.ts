import "server-only";
import { getIP } from "@better-auth/core/utils/ip";

/**
 * Where the client's IP comes from, shared by Better Auth's rate limits and App Cloud's.
 * Run the app behind a proxy that sets the header (and never expose the app port directly):
 * a client can send any value for a header the proxy doesn't overwrite.
 *   CLIENT_IP_HEADER  e.g. "x-real-ip" or "cf-connecting-ip" (default "x-forwarded-for")
 *   TRUSTED_PROXIES   the proxies' addresses, to read a multi-hop X-Forwarded-For
 */
export const ipAddressOptions = {
  ipAddressHeaders: (process.env.CLIENT_IP_HEADER || "x-forwarded-for")
    .split(",")
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
  ...(process.env.TRUSTED_PROXIES
    ? {
        trustedProxies: process.env.TRUSTED_PROXIES.split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      }
    : {}),
};

/** The client's IP, or "unknown" when no trustworthy address is available. */
export function clientIp(request: Request): string {
  return getIP(request, { advanced: { ipAddress: ipAddressOptions } }) ?? "unknown";
}
