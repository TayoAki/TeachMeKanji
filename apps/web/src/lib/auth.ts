import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { jwt } from "better-auth/plugins";
import { cimd } from "@better-auth/cimd";
import { fetchClientMetadataResource } from "@better-auth/cimd/node";
import { mcp } from "@better-auth/mcp";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import {
  ensureSignupGrant,
  invitesNeedVerifiedEmail,
  revokeAssistantAccess,
} from "@appbuilder/core";
import { getDb, schema } from "@appbuilder/db";
import { ipAddressOptions } from "./client-ip";
import { emailConfigured, sendEmail } from "./email";

const socialProviders: Parameters<typeof betterAuth>[0]["socialProviders"] = {};
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  socialProviders.google = {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  };
}
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  socialProviders.github = {
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  };
}

export const enabledSocialProviders = Object.keys(socialProviders) as Array<"google" | "github">;

/** The app's public origin. The OAuth issuer and the MCP endpoint are derived from it. */
export const appOrigin = (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(
  /\/$/,
  "",
);

/** The MCP server's resource identifier: access tokens are issued for exactly this URL. */
export const MCP_RESOURCE = `${appOrigin}/api/mcp`;

export const auth = betterAuth({
  baseURL: appOrigin,
  // The JWT plugin's /token route would clash with OAuth; clients use /oauth2/token.
  disabledPaths: ["/token"],
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // A reset signs out every session and disconnects every AI assistant, so it also evicts
    // anyone who registered the address first.
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: async ({ user }) => {
      await revokeAssistantAccess(getDb(), user.id);
    },
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your App Builder password",
        text: `Someone asked to reset the password for this App Builder account. To choose a new password, open:\n${url}\n\nThe link works for one hour. If you didn't ask for this, ignore this email.`,
      });
    },
  },
  emailVerification: {
    // Without an email provider in production there's nothing to send; invite links still work.
    sendOnSignUp: emailConfigured(),
    autoSignInAfterVerification: true,
    // Verifying proves who owns the address now: drop assistants connected before that.
    afterEmailVerification: async (user) => {
      await revokeAssistantAccess(getDb(), user.id);
    },
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Confirm your email for App Builder",
        // No user-chosen text (like the name) in the email: anyone can sign up with any address.
        text: `An App Builder account was created with this email address. If it was you, confirm it here:\n${url}\n\nIf you didn't create this account, don't open the link. You can take over the address at any time with "Forgot password" on the sign-in page.`,
      });
    },
  },
  advanced: { ipAddress: ipAddressOptions },
  rateLimit: {
    // On in production unless AUTH_RATE_LIMIT=0 (the e2e suite signs up many users per minute).
    enabled:
      (process.env.AUTH_RATE_LIMIT || (process.env.NODE_ENV === "production" ? "1" : "0")) === "1",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 10 },
      "/sign-up/email": { window: 60, max: 5 },
      "/send-verification-email": { window: 60, max: 3 },
      "/request-password-reset": { window: 60, max: 3 },
      "/oauth2/register": { window: 60, max: 10 },
    },
  },
  socialProviders,
  plugins: [
    // Signs OAuth access tokens; MCP clients verify nothing themselves, our /api/mcp does.
    jwt({ disableSettingJwtHeader: true }),
    // The platform is the OAuth server MCP clients (Claude, ChatGPT, Cursor) sign in through.
    mcp({
      loginPage: "/sign-in",
      consentPage: "/oauth/consent",
      resource: MCP_RESOURCE,
      // MCP clients register themselves (RFC 7591) before asking the user to connect. A
      // registered client can do nothing until a signed-in user approves it on the consent page.
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      // Desktop clients (Claude Code, Cursor) register loopback redirect URIs: treat those as
      // native apps, and https redirect URIs (claude.ai, chatgpt.com) as web apps.
      clientRegistrationDefaultApplicationType: "infer",
    }),
    // Newer MCP clients identify themselves with a metadata URL instead of registering.
    cimd({ fetchClientMetadataResource, metadataProfile: "mcp-2026-07-28" }),
  ],
  hooks: {
    // When email works and invites need it, only a verified account may approve an AI
    // assistant (otherwise an account registered with someone else's address could).
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/oauth2/consent") return;
      if (!emailConfigured() || !invitesNeedVerifiedEmail()) return;
      const session = await getSessionFromCtx(ctx);
      if (session && !session.user.emailVerified) {
        throw new APIError("FORBIDDEN", {
          message: "Verify your email address before connecting an AI assistant.",
        });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        // Every new account starts with the free plan's credits.
        after: async (user) => {
          await ensureSignupGrant(getDb(), user.id);
        },
      },
    },
  },
});
