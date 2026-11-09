import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { ensureSignupGrant } from "@appbuilder/core";
import { getDb, schema } from "@appbuilder/db";

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
  emailAndPassword: { enabled: true, minPasswordLength: 8 },
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
