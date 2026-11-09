import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { invitesNeedVerifiedEmail } from "@appbuilder/core";
import { auth } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { getViewer } from "@/lib/server";
import { ConsentForm } from "./consent-form";

export const metadata = { title: "Connect an app" };

/** Step two of connecting an AI assistant (Claude, ChatGPT…): the user approves access. */
export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const params = await searchParams;
  const query = new URLSearchParams(
    Object.entries(params).flatMap(([k, v]) =>
      typeof v === "string" ? [[k, v]] : (v ?? []).map((x) => [k, x]),
    ),
  ).toString();
  const viewer = await getViewer();
  if (!viewer) redirect(`/sign-in?${query}`);
  const clientId = typeof params.client_id === "string" ? params.client_id : "";
  const client = clientId
    ? await auth.api
        .getOAuthClientPublic({ query: { client_id: clientId }, headers: await headers() })
        .catch(() => null)
    : null;
  const scopes = typeof params.scope === "string" ? params.scope.split(" ") : [];
  const origin = (value: unknown) => {
    try {
      return typeof value === "string" ? new URL(value).origin : null;
    } catch {
      return null;
    }
  };
  // What the user can trust: where the approval is sent (the redirect URI, fixed when the
  // client registered), and for clients identified by a metadata URL, that URL's host. Names
  // from self-registration are whatever the client chose.
  const destination = origin(params.redirect_uri);
  const metadataHost = clientId.startsWith("https://") ? new URL(clientId).host : null;
  const clientUri =
    client?.client_uri && origin(client.client_uri) === destination ? client.client_uri : null;
  const mustVerify = emailConfigured() && invitesNeedVerifiedEmail() && !viewer.emailVerified;
  return (
    <ConsentForm
      clientName={client?.client_name || "An AI assistant"}
      nameVerifiedBy={metadataHost}
      destination={destination ? new URL(destination).host : null}
      clientUri={clientUri}
      offlineAccess={scopes.includes("offline_access")}
      mustVerify={mustVerify}
    />
  );
}
