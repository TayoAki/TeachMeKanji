/**
 * Settings shared by the Playwright config (which starts the servers) and the tests.
 * None of these are real credentials.
 */
export const E2E_DATABASE_URL =
  process.env.DATABASE_URL ?? "postgres://appbuilder:appbuilder@localhost:5432/appbuilder";
export const E2E_AUTH_SECRET =
  process.env.BETTER_AUTH_SECRET ?? "e2e-secret-e2e-secret-e2e-secret-0123";

/**
 * Stripe webhooks are verified for real: the tests sign events with this secret, exactly as
 * Stripe does. The API key is a placeholder; webhook verification never calls Stripe.
 */
export const E2E_STRIPE_WEBHOOK_SECRET = "whsec_e2e_0000000000000000000000000000";
export const E2E_STRIPE_KEY = "sk_test_e2e_placeholder";
export const E2E_STRIPE_PRICES = { studio: "price_e2e_studio", pro: "price_e2e_pro" };

/** E2E_PROD=1 runs the suite against production builds (`next start`, the preview's static server). */
export const E2E_PROD = process.env.E2E_PROD === "1";

/**
 * E2E_BASE_URL runs the suite against an already-running stack (for example
 * docker-compose.prod.yml) instead of starting servers. That stack needs the settings the
 * Playwright config passes to its own servers (fake LLM, the Stripe secret above, spikes on).
 */
export const E2E_BASE_URL = process.env.E2E_BASE_URL;

/** The operator token for /api/admin/* in the local stack (not a real credential). */
export const E2E_ADMIN_TOKEN = "e2e-admin-token-e2e-admin-token-0123456789";
