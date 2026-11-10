"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { Bot, Copy } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TimeAgo } from "@/components/time-ago";
import { api } from "@/lib/api";

interface Connection {
  id: string;
  clientName: string | null;
  clientUri: string | null;
  createdAt: string;
}

/** Settings: connect Claude, ChatGPT, Cursor… over MCP, and see or remove connections. */
export function AssistantsSection({ mcpUrl, allowed }: { mcpUrl: string; allowed: boolean }) {
  const [connections, setConnections] = useState<Connection[] | null>(null);
  const load = useCallback(() => {
    api<{ connections: Connection[] }>("/api/me/connections", { quiet: true })
      .then((r) => setConnections(r.connections))
      .catch(() => setConnections([]));
  }, []);
  useEffect(load, [load]);

  return (
    <section id="assistants">
      <h2 className="mb-1 flex items-center gap-2 text-lg font-semibold">
        <Bot className="size-5" /> Build from your AI assistant
        {!allowed ? <Badge variant="outline">Pro</Badge> : null}
      </h2>
      <p className="mb-3 text-sm text-muted-foreground">
        Use the Claude, ChatGPT or Cursor subscription you already have: it writes the code, your
        apps run and update here, and building this way uses no credits.
        {!allowed ? (
          <>
            {" "}
            <Link href="/pricing" className="underline">
              Upgrade to connect one
            </Link>
            .
          </>
        ) : null}
      </p>
      <div className="space-y-3 rounded-xl border bg-background p-4 text-sm">
        <div className="flex items-center gap-2">
          <code className="flex-1 truncate rounded-md bg-muted px-2 py-1.5" data-testid="mcp-url">
            {mcpUrl}
          </code>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              void navigator.clipboard?.writeText(mcpUrl);
              toast.success("Copied");
            }}
          >
            <Copy /> Copy
          </Button>
        </div>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>
            <span className="text-foreground">Claude</span> (web or desktop): Settings → Connectors
            → Add custom connector, paste the URL, then approve the connection here.
          </li>
          <li>
            <span className="text-foreground">ChatGPT</span>: add it as a custom connector
            (developer mode) with this URL and OAuth sign-in.
          </li>
          <li>
            <span className="text-foreground">Claude Code</span>:{" "}
            <code>claude mcp add --transport http app-builder {mcpUrl}</code>, then run{" "}
            <code>/mcp</code> to sign in.
          </li>
          <li>
            <span className="text-foreground">Cursor and others</span>: add an MCP server with this
            URL.
          </li>
        </ul>
      </div>
      <div className="mt-3 rounded-xl border bg-background" data-testid="connections">
        {connections === null ? (
          <p className="p-4 text-sm text-muted-foreground">Loading…</p>
        ) : connections.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No assistants connected yet.</p>
        ) : (
          <ul className="divide-y">
            {connections.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3 text-sm">
                <div className="flex-1">
                  <div className="font-medium">{c.clientName ?? "AI assistant"}</div>
                  <div className="text-xs text-muted-foreground">
                    Connected <TimeAgo date={c.createdAt} />
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={async () => {
                    await api(`/api/me/connections?id=${encodeURIComponent(c.id)}`, {
                      method: "DELETE",
                    });
                    toast.success(`${c.clientName ?? "Assistant"} disconnected`);
                    load();
                  }}
                >
                  Disconnect
                </Button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
