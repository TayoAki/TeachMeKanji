import { oauthProviderOpenIdConfigMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

/** OpenID Connect discovery, for clients that look here instead of RFC 8414. */
export const GET = oauthProviderOpenIdConfigMetadata(auth, {
  headers: { "Access-Control-Allow-Origin": "*" },
});
