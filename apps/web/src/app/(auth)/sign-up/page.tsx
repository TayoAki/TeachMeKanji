import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { factoryMode, PLANS, signUpAllowed } from "@appbuilder/core";
import { Button } from "@/components/ui/button";
import { enabledSocialProviders } from "@/lib/auth";
import { INVITE_COOKIE } from "@/lib/invite-cookie";
import { db, getViewer } from "@/lib/server";
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
  // Factory mode is invite-only: without a valid invite link opened first, there's no form.
  const invite = (await cookies()).get(INVITE_COOKIE)?.value ?? null;
  if (!(await signUpAllowed(db(), invite)))
    return (
      <div
        className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4"
        data-testid="invite-only"
      >
        <h1 className="text-2xl font-semibold">App Builder is invite-only</h1>
        <p className="text-sm text-muted-foreground">
          Ask a teammate for an invite link to one of their projects and open it here; it lets you
          create your account.
        </p>
        <Button asChild variant="outline">
          <Link href="/sign-in">I have an account</Link>
        </Button>
      </div>
    );
  return (
    <AuthForm
      mode="sign-up"
      social={enabledSocialProviders}
      prompt={typeof prompt === "string" ? prompt : undefined}
      oauthQuery={oauthQuery}
      next={next}
      signupCredits={factoryMode() ? 0 : PLANS.free.signupCredits}
    />
  );
}
