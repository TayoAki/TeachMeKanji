"use client";

/**
 * The builder's own recent errors in this tab (uncaught errors, rejected promises and failed
 * API calls), so a bug report arrives with clues. Generated apps run in a cross-origin preview
 * frame, so nothing from inside them lands here.
 */
const recent: string[] = [];
let installed = false;

export function noteClientError(message: string): void {
  recent.push(`${new Date().toISOString().slice(11, 19)} ${message}`.slice(0, 400));
  if (recent.length > 10) recent.shift();
}

export function recentClientErrors(): string[] {
  return [...recent];
}

export function installClientErrorBuffer(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;
  window.addEventListener("error", (event) => {
    const where = event.filename ? ` (${event.filename.split("/").pop()}:${event.lineno})` : "";
    noteClientError(`${event.message}${where}`);
  });
  window.addEventListener("unhandledrejection", (event) => {
    const reason = event.reason as { message?: string } | string | undefined;
    noteClientError(
      `Unhandled: ${typeof reason === "string" ? reason : (reason?.message ?? "rejection")}`,
    );
  });
}
