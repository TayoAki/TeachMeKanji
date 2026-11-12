import {
  legalLinksFor,
  withErrorReporting,
  withLegalLinks,
  type ProjectFiles,
} from "@appbuilder/contract";

/** The platform's public origin: App Cloud, analytics and the apps' hosted privacy policies. */
export function platformUrl(): string {
  return (
    process.env.APP_PUBLIC_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/**
 * The platform services every app gets: its empty Privacy and Terms links filled with the hosted
 * policy and Apple's EULA, and its errors on phones reported to the builder.
 */
export function withHostedLegalLinks(files: ProjectFiles, projectId: string): ProjectFiles {
  return withErrorReporting(withLegalLinks(files, legalLinksFor(platformUrl(), projectId)), {
    url: platformUrl(),
    projectId,
  });
}
