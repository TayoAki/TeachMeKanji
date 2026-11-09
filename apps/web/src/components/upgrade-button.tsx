"use client";

import Link from "next/link";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function UpgradeButton({
  signedIn,
  enabled,
  current,
}: {
  signedIn: boolean;
  enabled: boolean;
  current: boolean;
}) {
  const [busy, setBusy] = useState(false);
  if (current)
    return (
      <Button className="w-full" disabled>
        Your plan
      </Button>
    );
  if (!signedIn) {
    return (
      <Button asChild className="w-full">
        <Link href="/sign-up">Start free, upgrade anytime</Link>
      </Button>
    );
  }
  if (!enabled) {
    return (
      <Button className="w-full" disabled title="Billing isn't configured on this server">
        Upgrades unavailable
      </Button>
    );
  }
  return (
    <Button
      className="w-full"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { url } = await api<{ url: string }>("/api/billing/checkout", { method: "POST" });
          location.href = url;
        } catch {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : null} Upgrade to Pro
    </Button>
  );
}
