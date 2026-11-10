"use client";

import { useEffect, useState } from "react";
import { CircleCheck, CircleX, KeyRound, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { CONNECTORS, connectorById, type Connector } from "@appbuilder/contract/protocol";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Connection {
  provider: string;
  label: string | null;
  auth: "token" | "oauth";
}

/** Settings → Connectors: the user's own accounts the agent can use while it builds. */
export function ConnectorsSection({
  integrations,
  onChanged,
}: {
  integrations: Connection[];
  onChanged: () => void;
}) {
  // Coming back from a connector's sign-in page.
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const connected = params.get("connected");
    const error = params.get("connector_error");
    if (!connected && !error) return;
    if (connected) toast.success(`${connectorById(connected)?.name ?? "Connector"} connected`);
    if (error) toast.error(error);
    params.delete("connected");
    params.delete("connector_error");
    const query = params.toString();
    history.replaceState(null, "", `${location.pathname}${query ? `?${query}` : ""}#connectors`);
  }, []);

  return (
    <section id="connectors">
      <h2 className="text-lg font-semibold">Connectors</h2>
      <p className="mb-3 mt-1 text-sm text-muted-foreground">
        Let the agent use your own tools. Name one in the chat (&ldquo;build the paywall from my
        Linear issue&rdquo;, &ldquo;match the onboarding flows on Mobbin&rdquo;) and it reads from
        it, signed in as you, before it changes the app.
      </p>
      <div className="divide-y rounded-xl border bg-background" data-testid="connectors">
        {CONNECTORS.map((connector) => (
          <ConnectorRow
            key={connector.id}
            connector={connector}
            connection={integrations.find((i) => i.provider === connector.id)}
            onChanged={onChanged}
          />
        ))}
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Tokens are encrypted at rest, used only in runs you start, and only for the connectors your
        message names.
      </p>
    </section>
  );
}

function ConnectorRow({
  connector,
  connection,
  onChanged,
}: {
  connector: Connector;
  connection: Connection | undefined;
  onChanged: () => void;
}) {
  const [tokenForm, setTokenForm] = useState(false);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const [test, setTest] = useState<
    { ok: true; tools: string[] } | { ok: false; error: string } | null
  >(null);
  const runTest = async () => {
    setTesting(true);
    try {
      setTest(await api(`/api/connectors/${connector.id}/test`, { method: "POST" }));
    } catch {
      // api() already showed the error
    } finally {
      setTesting(false);
    }
  };
  const saveToken = async () => {
    setBusy(true);
    try {
      await api(`/api/integrations/${connector.id}`, { method: "PUT", json: { token } });
      toast.success(`${connector.name} connected`);
      setToken("");
      setTokenForm(false);
      onChanged();
    } catch {
      // api() has already shown the server's reason (e.g. "Linear rejected this token.").
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4" data-testid={`connector-${connector.id}`}>
      <div className="flex items-start gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-sm font-semibold"
          aria-hidden
        >
          {connector.name.slice(0, 1)}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{connector.name}</span>
            <Badge
              variant={connection ? "default" : "outline"}
              className={cn("h-5 text-[10px]", !connection && "text-muted-foreground")}
              data-testid="connector-status"
            >
              {connection ? "Connected" : "Not connected"}
            </Badge>
            {connection?.label && connection.label !== "Signed in" ? (
              <span className="text-xs text-muted-foreground">{connection.label}</span>
            ) : null}
          </div>
          <div className="text-sm text-muted-foreground">{connector.description}</div>
          {connector.unavailable ? (
            <div className="mt-1 text-xs text-muted-foreground">{connector.unavailable}</div>
          ) : connector.note && !connection ? (
            <div className="mt-1 text-xs text-muted-foreground">{connector.note}</div>
          ) : null}
        </div>
        {connection ? (
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={testing}
              onClick={runTest}
              data-testid="connector-test"
            >
              {testing ? <Loader2 className="animate-spin" /> : null} Test
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await api(`/api/integrations/${connector.id}`, { method: "DELETE" });
                toast.success(`${connector.name} disconnected`);
                setTest(null);
                onChanged();
              }}
            >
              Disconnect
            </Button>
          </div>
        ) : connector.unavailable ? (
          <Button variant="outline" size="sm" disabled>
            Not available yet
          </Button>
        ) : // Signing in leaves the builder for the service's own page, so it's a plain link.
        connector.oauth ? (
          <Button size="sm" asChild data-testid="connector-connect">
            <a href={`/api/connectors/${connector.id}/authorize?returnTo=%2Fsettings`}>Connect</a>
          </Button>
        ) : (
          <Button size="sm" onClick={() => setTokenForm(true)} data-testid="connector-connect">
            Connect
          </Button>
        )}
      </div>

      {connection && test ? (
        <p
          className="ml-12 mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"
          data-testid="connector-test-result"
        >
          {test.ok ? (
            <>
              <CircleCheck className="mt-px size-3.5 shrink-0 text-green-600" />
              <span>
                Works: {test.tools.length} {test.tools.length === 1 ? "tool" : "tools"}
                {test.tools.length
                  ? ` (${test.tools.slice(0, 6).join(", ")}${test.tools.length > 6 ? ", …" : ""})`
                  : ""}
                . Builds can read from it when you mention {connector.name} in the chat.
              </span>
            </>
          ) : (
            <>
              <CircleX className="mt-px size-3.5 shrink-0 text-destructive" />
              <span>{test.error}</span>
            </>
          )}
        </p>
      ) : null}

      {!connection && !connector.unavailable && connector.token ? (
        tokenForm ? (
          <div className="ml-12 mt-3 space-y-2">
            <div className="flex gap-2">
              <Input
                type="password"
                placeholder={`Paste your ${connector.token.label}`}
                value={token}
                onChange={(e) => setToken(e.target.value)}
                aria-label={`${connector.name} token`}
                autoFocus
              />
              <Button disabled={token.trim().length < 10 || busy} onClick={saveToken}>
                {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              {connector.token.help}{" "}
              <a href={connector.token.link} target="_blank" rel="noreferrer" className="underline">
                Create one
              </a>
            </p>
          </div>
        ) : connector.oauth ? (
          <button
            type="button"
            className="ml-12 mt-2 text-xs text-muted-foreground underline"
            onClick={() => setTokenForm(true)}
          >
            Paste a token instead ({connector.token.label})
          </button>
        ) : null
      ) : null}
    </div>
  );
}
