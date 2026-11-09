import { redirect } from "next/navigation";
import { enabledSocialProviders } from "@/lib/auth";
import { emailConfigured } from "@/lib/email";
import { getViewer } from "@/lib/server";
import { AuthForm } from "../auth-form";
import { oauthQueryFrom, safeNextPath } from "../oauth-query";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const params = await searchParams;
  const { prompt, reset } = params;
  // An AI assistant's connection request (signed by the OAuth server) continues after sign-in.
  const oauthQuery = oauthQueryFrom(params);
  const next = safeNextPath(params.next);
  if (!oauthQuery && (await getViewer()))
    redirect(next ?? (typeof prompt === "string" ? `/?prompt=${encodeURIComponent(prompt)}` : "/"));
  return (
    <AuthForm
      mode="sign-in"
      social={enabledSocialProviders}
      prompt={typeof prompt === "string" ? prompt : undefined}
      oauthQuery={oauthQuery}
      next={next}
      canResetPassword={emailConfigured()}
      notice={reset ? "Your password was changed. Sign in with the new one." : undefined}
    />
  );
}
