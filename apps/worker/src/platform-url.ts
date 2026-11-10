import { legalLinksFor, withLegalLinks, type ProjectFiles } from "@appbuilder/contract";

/** The platform's public origin: App Cloud, analytics and the apps' hosted privacy policies. */
export function platformUrl(): string {
  return (
    process.env.APP_PUBLIC_URL ||
    process.env.BETTER_AUTH_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

/** Fill the app's empty Privacy and Terms links with the hosted policy and Apple's EULA. */
export function withHostedLegalLinks(files: ProjectFiles, projectId: string): ProjectFiles {
  return withLegalLinks(files, legalLinksFor(platformUrl(), projectId));
}
