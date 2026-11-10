import "server-only";

/** When the privacy policy and terms last changed (shown on both pages). */
export const LEGAL_UPDATED = "November 10, 2026";

/**
 * Who stands behind the service, from the environment so the pages need no code change:
 * LEGAL_ENTITY_NAME, LEGAL_CONTACT_EMAIL, LEGAL_POSTAL_ADDRESS, LEGAL_GOVERNING_LAW.
 * Unset values show as a visible placeholder rather than an invented company.
 */
export function legalConfig() {
  return {
    entity: process.env.LEGAL_ENTITY_NAME || "[company name — set LEGAL_ENTITY_NAME]",
    email: process.env.LEGAL_CONTACT_EMAIL || "[contact email — set LEGAL_CONTACT_EMAIL]",
    address: process.env.LEGAL_POSTAL_ADDRESS || "",
    law: process.env.LEGAL_GOVERNING_LAW || "[governing law — set LEGAL_GOVERNING_LAW]",
  };
}
