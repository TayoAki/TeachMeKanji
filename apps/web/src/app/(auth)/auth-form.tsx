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

export function AuthForm({
  mode,
  social,
  prompt,
  notice,
  oauthQuery,
  next: nextPath,
  canResetPassword = true,
}: {
  mode: "sign-in" | "sign-up";
  social: Array<"google" | "github">;
  prompt?: string;
  notice?: string;
  oauthQuery?: string;
  /** Where to go after signing in (an invite link, say). */
  next?: string;
  /** False when the server can't send email: then there's no reset link to offer. */
  canResetPassword?: boolean;
}) {
  const router = useRouter();
  const next = nextPath ?? (prompt ? `/?prompt=${encodeURIComponent(prompt)}` : "/");
  const carry = oauthQuery
    ? `?${oauthQuery}`
    : nextPath
      ? `?next=${encodeURIComponent(nextPath)}`
      : prompt
        ? `?prompt=${encodeURIComponent(prompt)}`
        : "";
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError(null);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    const result =
      mode === "sign-up"
        ? await authClient.signUp.email({
            email,
            password,
            name: String(form.get("name") || email.split("@")[0]),
          })
        : await authClient.signIn.email({ email, password });
    setBusy(false);
    if (result.error) {
      setError(result.error.message ?? "Something went wrong.");
      return;
    }
    // Connecting an AI assistant: the OAuth server says where to go next (consent).
    const continueTo = (result.data as { redirect?: boolean; url?: string } | null)?.url;
    if (oauthQuery && continueTo) {
      window.location.href = continueTo;
      return;
    }
    router.push(next);
    router.refresh();
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 px-4">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          AB
        </span>
        App Builder
      </Link>
      <div>
        <h1 className="text-2xl font-semibold">
          {mode === "sign-up" ? "Create your account" : "Welcome back"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {mode === "sign-up" ? "You start with 100 free credits." : "Sign in to keep building."}
        </p>
      </div>
      {notice ? (
        <p className="rounded-md border bg-muted/50 px-3 py-2 text-sm" role="status">
          {notice}
        </p>
      ) : null}
      {social.length > 0 ? (
        <div className="grid gap-2">
          {social.map((provider) => (
            <Button
              key={provider}
              variant="outline"
              onClick={() => authClient.signIn.social({ provider, callbackURL: next })}
            >
              Continue with {provider === "google" ? "Google" : "GitHub"}
            </Button>
          ))}
          <div className="my-1 text-center text-xs text-muted-foreground">or</div>
        </div>
      ) : null}
      <form onSubmit={submit} className="grid gap-4">
        {mode === "sign-up" ? (
          <div className="grid gap-1.5">
            <Label htmlFor="name">Name</Label>
            <Input id="name" name="name" autoComplete="name" required />
          </div>
        ) : null}
        <div className="grid gap-1.5">
          <Label htmlFor="email">Email</Label>
          <Input id="email" name="email" type="email" autoComplete="email" required />
        </div>
        <div className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {mode === "sign-in" && canResetPassword ? (
              <Link href="/forgot-password" className="text-xs text-muted-foreground underline">
                Forgot password?
              </Link>
            ) : null}
          </div>
          <Input
            id="password"
            name="password"
            type="password"
            minLength={8}
            autoComplete={mode === "sign-up" ? "new-password" : "current-password"}
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
          {mode === "sign-up" ? "Create account" : "Sign in"}
        </Button>
        {mode === "sign-up" ? (
          <p className="text-center text-xs text-muted-foreground" data-testid="sign-up-consent">
            By creating an account you agree to the{" "}
            <Link href="/terms" className="underline">
              Terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="underline">
              Privacy Policy
            </Link>
            .
          </p>
        ) : null}
      </form>
      <p className="text-center text-sm text-muted-foreground">
        {mode === "sign-up" ? (
          <>
            Already have an account?{" "}
            <Link href={`/sign-in${carry}`} className="text-foreground underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href={`/sign-up${carry}`} className="text-foreground underline">
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
