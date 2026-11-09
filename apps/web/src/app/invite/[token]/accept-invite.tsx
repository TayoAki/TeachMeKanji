"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useHydrated } from "@/hooks/use-hydrated";
import { api } from "@/lib/api";

export function AcceptInvite({ token }: { token: string }) {
  const router = useRouter();
  const hydrated = useHydrated();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      disabled={!hydrated || busy}
      data-testid="accept-invite"
      onClick={async () => {
        setBusy(true);
        try {
          const { projectId } = await api<{ projectId: string }>("/api/invites/accept", {
            method: "POST",
            json: { token },
          });
          router.push(`/projects/${projectId}`);
        } catch {
          setBusy(false);
        }
      }}
    >
      {busy ? <Loader2 className="animate-spin" /> : null} Join project
    </Button>
  );
}
