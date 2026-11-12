import { redirect } from "next/navigation";
import { PLANS } from "@appbuilder/core";
import { enabledSocialProviders } from "@/lib/auth";
import { getViewer } from "@/lib/server";
import { AuthForm } from "../auth-form";
import { oauthQueryFrom, safeNextPath } from "../oauth-query";

export const metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const params = await searchParams;
  const prompt = params.prompt;
  const oauthQuery = oauthQueryFrom(params);
  const next = safeNextPath(params.next);
  if (!oauthQuery && (await getViewer()))
    redirect(next ?? (typeof prompt === "string" ? `/?prompt=${encodeURIComponent(prompt)}` : "/"));
  return (
    <AuthForm
      mode="sign-up"
      social={enabledSocialProviders}
      prompt={typeof prompt === "string" ? prompt : undefined}
      oauthQuery={oauthQuery}
      next={next}
      signupCredits={PLANS.free.signupCredits}
    />
  );
}
