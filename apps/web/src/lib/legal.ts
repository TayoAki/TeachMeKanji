import "server-only";

/** When the privacy policy and terms last changed (shown on both pages). */
export const LEGAL_UPDATED = "November 11, 2026";

/**
 * Who stands behind the service, from the environment so the pages need no code change:
 * LEGAL_ENTITY_NAME, LEGAL_CONTACT_EMAIL, LEGAL_POSTAL_ADDRESS, LEGAL_GOVERNING_LAW.
 * Without a company name the pages name the service ("App Builder") rather than an invented
 * company; the other unset values show as a visible placeholder.
 */
export function legalConfig() {
  return {
    entity: process.env.LEGAL_ENTITY_NAME || "App Builder",
    email: process.env.LEGAL_CONTACT_EMAIL || "[contact email — set LEGAL_CONTACT_EMAIL]",
    address: process.env.LEGAL_POSTAL_ADDRESS || "",
    law: process.env.LEGAL_GOVERNING_LAW || "[governing law — set LEGAL_GOVERNING_LAW]",
  };
}
