"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Shell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          AB
        </span>
        App Builder
      </Link>
      <h1 className="text-2xl font-semibold">{title}</h1>
      {children}
    </div>
  );
}

/** Step 1: ask for a reset link by email. */
export function ForgotPasswordForm() {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const email = String(new FormData(event.currentTarget).get("email"));
    setBusy(true);
    setError(null);
    const result = await authClient.requestPasswordReset({ email, redirectTo: "/reset-password" });
    setBusy(false);
    if (result.error) setError(result.error.message ?? "Something went wrong.");
    else setSent(true);
  };

  return (
    <Shell title="Reset your password">
      {sent ? (
        <p className="text-sm text-muted-foreground" data-testid="reset-sent">
          If an account uses that address, we&apos;ve sent it a link to choose a new password.
        </p>
      ) : (
        <form onSubmit={submit} className="grid gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" name="email" type="email" autoComplete="email" required />
          </div>
          {error ? (
            <p className="text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy || !hydrated}>
            {busy ? <Loader2 className="animate-spin" /> : null}
            Send reset link
          </Button>
        </form>
      )}
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/sign-in" className="text-foreground underline">
          Back to sign in
        </Link>
      </p>
    </Shell>
  );
}

/** Step 2: the link from the email lands here with ?token=… (or ?error=INVALID_TOKEN). */
export function ResetPasswordForm({ token, invalid }: { token: string | null; invalid: boolean }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!token || invalid) {
    return (
      <Shell title="This link has expired">
        <p className="text-sm text-muted-foreground">
          Reset links work once, for one hour.{" "}
          <Link href="/forgot-password" className="text-foreground underline">
            Send a new link
          </Link>
          .
        </p>
      </Shell>
    );
  }

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const newPassword = String(new FormData(event.currentTarget).get("password"));
    setBusy(true);
    setError(null);
    const result = await authClient.resetPassword({ newPassword, token });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong.");
      return;
    }
    router.push("/sign-in?reset=1");
  };

  return (
    <Shell title="Choose a new password">
      <form onSubmit={submit} className="grid gap-4">
        <div className="grid gap-1.5">
          <Label htmlFor="password">New password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            minLength={8}
            autoComplete="new-password"
            required
          />
        </div>
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {error}
          </p>
        ) : null}
        <Button type="submit" disabled={busy || !hydrated}>
          {busy ? <Loader2 className="animate-spin" /> : null}
          Save password
        </Button>
      </form>
    </Shell>
  );
}
