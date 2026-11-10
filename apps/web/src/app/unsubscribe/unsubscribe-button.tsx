"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

export function UnsubscribeButton({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  if (done)
    return (
      <p className="mt-6 text-sm" data-testid="unsubscribed">
        Done — you&rsquo;re unsubscribed.
      </p>
    );
  return (
    <Button
      className="mt-6"
      onClick={async () => {
        await api("/api/leads/unsubscribe", { method: "POST", json: { token } });
        setDone(true);
      }}
    >
      Unsubscribe
    </Button>
  );
}
