import { redirect } from "next/navigation";
import { enabledSocialProviders } from "@/lib/auth";
import { getViewer } from "@/lib/server";
import { AuthForm } from "../auth-form";

export const metadata = { title: "Create account" };

export default async function SignUpPage({ searchParams }: PageProps<"/sign-up">) {
  const prompt = (await searchParams).prompt;
  if (await getViewer())
    redirect(typeof prompt === "string" ? `/?prompt=${encodeURIComponent(prompt)}` : "/");
  return (
    <AuthForm
      mode="sign-up"
      social={enabledSocialProviders}
      prompt={typeof prompt === "string" ? prompt : undefined}
    />
  );
}
