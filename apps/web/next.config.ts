import { existsSync } from "node:fs";
import type { NextConfig } from "next";

// One .env at the repo root configures the web app, the worker and migrations.
// (apps/web/.env.local still works and takes precedence.)
if (existsSync("../../.env")) process.loadEnvFile("../../.env");

const nextConfig: NextConfig = {
  // Every page here is per-user and dynamic, so Cache Components' static shell buys little.
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  devIndicators: false,
  serverExternalPackages: ["pg", "@aws-sdk/client-s3"],
  experimental: {
    serverActions: { bodySizeLimit: "60mb" },
  },
};

export default nextConfig;
