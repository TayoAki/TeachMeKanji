import { oauthProviderAuthServerMetadata } from "@better-auth/oauth-provider";
import { auth } from "@/lib/auth";

/**
 * OAuth authorization-server metadata (RFC 8414), at the root and at the issuer's path
 * (/api/auth): MCP clients read it to find the authorize, token and registration endpoints.
 */
export const GET = oauthProviderAuthServerMetadata(auth, {
  headers: { "Access-Control-Allow-Origin": "*" },
});
