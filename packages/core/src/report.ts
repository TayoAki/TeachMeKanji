/**
 * Error reporting: one JSON line per error on stderr (for any log pipeline), and optionally a
 * POST to ERROR_WEBHOOK_URL (Slack/Discord-style incoming webhook or a collector).
 */
export function reportError(error: unknown, context: Record<string, unknown> = {}): void {
  const err = error instanceof Error ? error : new Error(String(error));
  const cause = (err as { cause?: { code?: unknown; message?: unknown } }).cause;
  const entry = {
    level: "error",
    time: new Date().toISOString(),
    message: redact(err.message),
    name: err.name,
    ...(cause?.code ? { code: String(cause.code) } : {}),
    ...(cause?.message ? { cause: redact(String(cause.message)) } : {}),
    stack: redact(err.stack?.split("\n").slice(0, 8).join("\n") ?? ""),
    ...context,
  };
  console.error(JSON.stringify(entry));
  const url = process.env.ERROR_WEBHOOK_URL;
  if (url) {
    void fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: `${entry.name}: ${entry.message}`, ...entry }),
    }).catch(() => {});
  }
}

/**
 * Database errors carry the query's parameters (Drizzle: "Failed query: …\nparams: …"), which
 * can hold users' emails, password hashes and records. Logs keep the query, not the values.
 */
export function redact(text: string): string {
  // Up to the stack frames ("    at …"), or the end.
  return text.replace(/params: [\s\S]*?(?=\n\s+at |$)/, "params: [redacted]");
}
