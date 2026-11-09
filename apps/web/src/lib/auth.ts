import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { ensureSignupGrant } from "@appbuilder/core";
import { getDb, schema } from "@appbuilder/db";
import { ipAddressOptions } from "./client-ip";
import { sendEmail } from "./email";

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

export const auth = betterAuth({
  baseURL: process.env.BETTER_AUTH_URL,
  database: drizzleAdapter(getDb(), { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
    // A reset signs out every session, so it also evicts anyone who registered the address first.
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail({
        to: user.email,
        subject: "Reset your App Builder password",
        text: `Someone asked to reset the password for this App Builder account. To choose a new password, open:\n${url}\n\nThe link works for one hour. If you didn't ask for this, ignore this email.`,
      });
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
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
    },
  },
  socialProviders,
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
