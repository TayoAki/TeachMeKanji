"use client";

import { toast } from "sonner";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(
  path: string,
  init: RequestInit & { json?: unknown; quiet?: boolean } = {},
): Promise<T> {
  const { json, quiet, ...rest } = init;
  const response = await fetch(path, {
    ...rest,
    headers:
      json !== undefined ? { "Content-Type": "application/json", ...rest.headers } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  const body = (await response.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!response.ok) {
    const error = new ApiError(
      response.status,
      body.error ?? `Request failed (${response.status})`,
      body.code,
    );
    if (!quiet) {
      if (response.status === 402) {
        toast.error(error.message, {
          action: {
            label: "Get credits",
            onClick: () => window.location.assign(new URL("/pricing", window.location.origin)),
          },
        });
      } else toast.error(error.message);
    }
    throw error;
  }
  return body as T;
}
