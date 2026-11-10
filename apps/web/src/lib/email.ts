import "server-only";

// Shared with the worker (funnel emails): see packages/core/src/email.ts.
export { emailConfigured, emailProviderSet, sendEmail } from "@appbuilder/core";
