"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CreditCard, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";

interface PaymentsState {
  payments: { iosApiKey: string; androidApiKey: string; entitlement: string };
  identifiers: { ios: string; android: string };
  revenuecatConnected: boolean;
}

/**
 * Right-sidebar panel: real purchases with RevenueCat (store and TestFlight builds), or test
 * mode. Keys go into the platform file data/payments.ts as a new version.
 */
export function PaymentsPanel({
  projectId,
  canManage,
  disabled,
  versionId,
  onChanged,
  onStartRun,
}: {
  projectId: string;
  canManage: boolean;
  disabled: boolean;
  versionId: string | null;
  onChanged: () => void;
  onStartRun: (runId: string) => void;
}) {
  const [state, setState] = useState<PaymentsState | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ iosApiKey: "", androidApiKey: "", entitlement: "premium" });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!versionId) return;
    api<PaymentsState>(`/api/projects/${projectId}/payments`, { quiet: true })
      .then((s) => {
        setState(s);
        setForm(s.payments);
      })
      .catch(() => {});
  }, [projectId, versionId]);

  if (!state) return null;
  const live = Boolean(state.payments.iosApiKey || state.payments.androidApiKey);

  const save = async () => {
    setBusy(true);
    try {
      await api(`/api/projects/${projectId}/payments`, { method: "PUT", json: form });
      toast.success(
        form.iosApiKey || form.androidApiKey ? "RevenueCat connected" : "Back to test mode",
      );
      setEditing(false);
      onChanged();
    } catch {
      // api() showed why.
    } finally {
      setBusy(false);
    }
  };

  const setUp = async () => {
    setBusy(true);
    try {
      const { runId } = await api<{ runId: string }>(`/api/projects/${projectId}/payments/setup`, {
        method: "POST",
      });
      onStartRun(runId);
    } catch {
      // api() showed why.
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="border-b p-4" data-testid="payments-panel">
      <div className="mb-2 flex items-center gap-2">
        <CreditCard className="size-4" />
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Payments
        </h2>
        <Badge
          variant={live ? "default" : "outline"}
          className="ml-auto"
          data-testid="payments-mode"
        >
          {live ? "RevenueCat" : "Test mode"}
        </Badge>
      </div>
      <p className="text-xs text-muted-foreground">
        {live
          ? "Store and TestFlight builds sell through Apple and Google with RevenueCat. Expo Go and the preview stay in test mode."
          : "Purchases are simulated: nothing is charged. Connect RevenueCat to sell in store builds."}
      </p>
      {canManage && !editing ? (
        <div className="mt-3 flex flex-wrap gap-2">
          {state.revenuecatConnected ? (
            <Button
              size="sm"
              onClick={setUp}
              disabled={busy || disabled}
              data-testid="payments-setup"
            >
              {busy ? <Loader2 className="animate-spin" /> : <Sparkles />}
              {live ? "Update in RevenueCat" : "Set up in RevenueCat"}
            </Button>
          ) : (
            <Button size="sm" variant="outline" asChild>
              <Link href="/settings#connectors">Connect RevenueCat</Link>
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setEditing(true)}
            disabled={disabled}
            data-testid="payments-edit"
          >
            {live ? "Edit keys" : "Paste keys"}
          </Button>
        </div>
      ) : null}
      {canManage && editing ? (
        <div className="mt-3 grid gap-2">
          <Input
            placeholder="App Store public key (appl_…)"
            value={form.iosApiKey}
            onChange={(e) => setForm({ ...form, iosApiKey: e.target.value })}
            aria-label="RevenueCat App Store key"
          />
          <Input
            placeholder="Google Play public key (goog_…)"
            value={form.androidApiKey}
            onChange={(e) => setForm({ ...form, androidApiKey: e.target.value })}
            aria-label="RevenueCat Google Play key"
          />
          <Input
            placeholder="Entitlement"
            value={form.entitlement}
            onChange={(e) => setForm({ ...form, entitlement: e.target.value })}
            aria-label="RevenueCat entitlement"
          />
          <p className="text-[11px] text-muted-foreground">
            RevenueCat → your project → Apps → API keys (the public ones). Products need the same
            IDs in App Store Connect and Google Play, under bundle id{" "}
            <span className="font-mono">{state.identifiers.ios}</span>.
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={save}
              disabled={busy || disabled}
              data-testid="payments-save"
            >
              {busy ? <Loader2 className="animate-spin" /> : null} Save
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
