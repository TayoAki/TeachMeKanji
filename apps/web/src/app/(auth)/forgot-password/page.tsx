import Link from "next/link";
import { connection } from "next/server";
import { emailConfigured } from "@/lib/email";
import { ForgotPasswordForm } from "../password-reset";

export const metadata = { title: "Reset your password" };

export default async function ForgotPasswordPage() {
  await connection(); // read the email settings at request time, not build time
  if (!emailConfigured()) {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-4 px-4">
        <h1 className="text-2xl font-semibold">Password reset isn&apos;t available</h1>
        <p className="text-sm text-muted-foreground">
          This server can&apos;t send email yet, so passwords can&apos;t be reset by link. Contact
          the site&apos;s administrator.
        </p>
        <Link href="/sign-in" className="text-sm underline">
          Back to sign in
        </Link>
      </div>
    );
  }
  return <ForgotPasswordForm />;
}
