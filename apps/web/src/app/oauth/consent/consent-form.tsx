"use client";

import Link from "next/link";
import { useState } from "react";
import { Check, Loader2 } from "lucide-react";
import { useHydrated } from "@/hooks/use-hydrated";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";

export function ConsentForm({
  clientName,
  nameVerifiedBy,
  destination,
  clientUri,
  offlineAccess,
  mustVerify,
}: {
  clientName: string;
  /** The host of the client's metadata URL, when it identified itself with one. */
  nameVerifiedBy: string | null;
  /** The host the approval is sent to. */
  destination: string | null;
  clientUri: string | null;
  offlineAccess: boolean;
  mustVerify: boolean;
}) {
  const hydrated = useHydrated();
  const [busy, setBusy] = useState<null | "allow" | "deny">(null);
  const [error, setError] = useState<string | null>(null);

  const decide = async (accept: boolean) => {
    setBusy(accept ? "allow" : "deny");
    setError(null);
    // The client plugin attaches this page's signed OAuth request.
    const result = await authClient.oauth2.consent({ accept });
    if (result.error || !result.data?.url) {
      setBusy(null);
      setError(result.error?.message ?? "Something went wrong. Start again from your assistant.");
      return;
    }
    window.location.href = result.data.url;
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-6 px-4">
      <Link href="/" className="flex items-center gap-2 font-semibold">
        <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
          AB
        </span>
        App Builder
      </Link>
      <div>
        <h1 className="text-2xl font-semibold" data-testid="consent-title">
          Connect {clientName}?
        </h1>
        <p className="mt-1 text-sm text-muted-foreground" data-testid="consent-identity">
          {nameVerifiedBy
            ? `Identified by ${nameVerifiedBy}.`
            : "The name is chosen by the app itself; check where you'll be sent."}
          {clientUri ? ` ${clientUri}` : ""}
        </p>
        {destination ? (
          <p className="mt-2 rounded-md bg-muted px-3 py-2 text-sm">
            After you allow it, you&apos;ll return to{" "}
            <span className="font-semibold" data-testid="consent-destination">
              {destination}
            </span>
            . Only continue if that is the assistant you&apos;re connecting.
          </p>
        ) : null}
      </div>
      <div className="rounded-xl border bg-background p-4 text-sm">
        <p className="font-medium">{clientName} will be able to:</p>
        <ul className="mt-3 space-y-2">
          {[
            "See and create your projects",
            "Write your apps' code (each change is saved as a version you can restore)",
            "Turn on App Cloud and publish apps you own",
            ...(offlineAccess ? ["Stay connected until you disconnect it"] : []),
          ].map((line) => (
            <li key={line} className="flex gap-2">
              <Check className="mt-0.5 size-4 shrink-0 text-emerald-600" /> {line}
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-muted-foreground">
          It uses your own AI subscription; building here costs no credits.
        </p>
      </div>
      {mustVerify ? (
        <p className="text-sm text-destructive" role="alert">
          Verify your email address first (check your inbox), then connect again from your
          assistant.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Button
          variant="outline"
          className="flex-1"
          disabled={!hydrated || busy !== null}
          onClick={() => decide(false)}
        >
          {busy === "deny" ? <Loader2 className="animate-spin" /> : null} Cancel
        </Button>
        <Button
          className="flex-1"
          disabled={!hydrated || busy !== null || mustVerify}
          onClick={() => decide(true)}
          data-testid="consent-allow"
        >
          {busy === "allow" ? <Loader2 className="animate-spin" /> : null} Allow
        </Button>
      </div>
    </div>
  );
}
