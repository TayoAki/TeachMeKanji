"use client";

import { useState } from "react";
import { Apple, KeyRound, Loader2, Play } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";

interface Connection {
  provider: string;
  label: string | null;
}

/**
 * Settings → Phone builds: the keys that let a build go straight to TestFlight and to Google
 * Play's internal testing. Each is checked with Apple or Google before it's saved, encrypted.
 */
export function StoreKeys({
  integrations,
  onChanged,
}: {
  integrations: Connection[];
  onChanged: () => void;
}) {
  return (
    <>
      <AppStoreConnectKey
        connected={integrations.find((i) => i.provider === "app-store-connect")}
        onChanged={onChanged}
      />
      <PlayConsoleKey
        connected={integrations.find((i) => i.provider === "play-console")}
        onChanged={onChanged}
      />
    </>
  );
}

function Card({
  testId,
  icon,
  title,
  connected,
  help,
  onDisconnect,
  children,
}: {
  testId: string;
  icon: React.ReactNode;
  title: string;
  connected: Connection | undefined;
  help: React.ReactNode;
  onDisconnect: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border bg-background p-4" data-testid={testId}>
      <div className="flex items-center gap-3">
        {icon}
        <div className="flex-1">
          <div className="font-medium">{title}</div>
          <div className="text-xs text-muted-foreground">
            {connected ? `Connected · ${connected.label}` : help}
          </div>
        </div>
        {connected ? (
          <Button variant="outline" size="sm" onClick={onDisconnect}>
            Disconnect
          </Button>
        ) : null}
      </div>
      {connected ? null : <div className="mt-3 grid gap-2">{children}</div>}
    </div>
  );
}

async function save(provider: string, token: string, title: string, onChanged: () => void) {
  try {
    await api(`/api/integrations/${provider}`, { method: "PUT", json: { token } });
    toast.success(`${title} connected`);
    onChanged();
    return true;
  } catch {
    return false; // api() showed why
  }
}

async function disconnect(provider: string, onChanged: () => void) {
  await api(`/api/integrations/${provider}`, { method: "DELETE" });
  onChanged();
}

function AppStoreConnectKey({
  connected,
  onChanged,
}: {
  connected: Connection | undefined;
  onChanged: () => void;
}) {
  const [key, setKey] = useState({
    keyId: "",
    issuerId: "",
    teamId: "",
    teamType: "INDIVIDUAL",
    privateKey: "",
  });
  const [busy, setBusy] = useState(false);
  const ready = key.keyId && key.issuerId && key.teamId && key.privateKey;
  return (
    <Card
      testId="integration-app-store-connect"
      icon={<Apple className="size-5" />}
      title="App Store Connect (TestFlight)"
      connected={connected}
      help={
        <>
          An API key with the App Manager role, so builds go to TestFlight by themselves. App Store
          Connect → Users and Access → Integrations → App Store Connect API.{" "}
          <a
            href="https://appstoreconnect.apple.com/access/integrations/api"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            Create a key
          </a>
        </>
      }
      onDisconnect={() => disconnect("app-store-connect", onChanged)}
    >
      <div className="grid grid-cols-3 gap-2">
        <Input
          placeholder="Key ID"
          value={key.keyId}
          onChange={(e) => setKey({ ...key, keyId: e.target.value })}
          aria-label="App Store Connect key ID"
        />
        <Input
          placeholder="Issuer ID"
          value={key.issuerId}
          onChange={(e) => setKey({ ...key, issuerId: e.target.value })}
          aria-label="App Store Connect issuer ID"
          className="col-span-2"
        />
        <Input
          placeholder="Team ID"
          value={key.teamId}
          onChange={(e) => setKey({ ...key, teamId: e.target.value })}
          aria-label="Apple team ID"
        />
        <select
          className="col-span-2 h-9 rounded-md border bg-background px-2 text-sm"
          value={key.teamType}
          onChange={(e) => setKey({ ...key, teamType: e.target.value })}
          aria-label="Apple team type"
        >
          <option value="INDIVIDUAL">Individual developer</option>
          <option value="COMPANY_OR_ORGANIZATION">Company or organization</option>
          <option value="IN_HOUSE">Enterprise (in-house)</option>
        </select>
      </div>
      <Textarea
        placeholder="Contents of the .p8 file (-----BEGIN PRIVATE KEY----- …)"
        value={key.privateKey}
        onChange={(e) => setKey({ ...key, privateKey: e.target.value })}
        aria-label="App Store Connect private key"
        className="min-h-20 font-mono text-xs"
      />
      <Button
        className="justify-self-start"
        disabled={!ready || busy}
        onClick={async () => {
          setBusy(true);
          await save("app-store-connect", JSON.stringify(key), "App Store Connect", onChanged);
          setBusy(false);
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Save key
      </Button>
    </Card>
  );
}

function PlayConsoleKey({
  connected,
  onChanged,
}: {
  connected: Connection | undefined;
  onChanged: () => void;
}) {
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Card
      testId="integration-play-console"
      icon={<Play className="size-5" />}
      title="Google Play (internal testing)"
      connected={connected}
      help={
        <>
          A Google Cloud service account&rsquo;s JSON key, invited in Play Console → Users and
          permissions with release rights, so builds go to internal testing by themselves.{" "}
          <a
            href="https://docs.expo.dev/submit/android/"
            target="_blank"
            rel="noreferrer"
            className="underline"
          >
            How to create one
          </a>
        </>
      }
      onDisconnect={() => disconnect("play-console", onChanged)}
    >
      <Textarea
        placeholder='{"type": "service_account", "client_email": "…", "private_key": "…"}'
        value={json}
        onChange={(e) => setJson(e.target.value)}
        aria-label="Google Play service account key"
        className="min-h-20 font-mono text-xs"
      />
      <Button
        className="justify-self-start"
        disabled={json.trim().length < 10 || busy}
        onClick={async () => {
          setBusy(true);
          if (await save("play-console", json, "Google Play", onChanged)) setJson("");
          setBusy(false);
        }}
      >
        {busy ? <Loader2 className="animate-spin" /> : <KeyRound />} Save key
      </Button>
    </Card>
  );
}
