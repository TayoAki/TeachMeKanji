import { redirect } from "next/navigation";
import { enabledSocialProviders } from "@/lib/auth";
import { getViewer } from "@/lib/server";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: PageProps<"/sign-in">) {
  const prompt = (await searchParams).prompt;
  if (await getViewer())
    redirect(typeof prompt === "string" ? `/?prompt=${encodeURIComponent(prompt)}` : "/");
  return (
    <AuthForm
      mode="sign-in"
      social={enabledSocialProviders}
      prompt={typeof prompt === "string" ? prompt : undefined}
    />
  );
}
