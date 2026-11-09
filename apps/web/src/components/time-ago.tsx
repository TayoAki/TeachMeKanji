"use client";

import { timeAgo } from "@/lib/utils";

/**
 * Relative time ("3 min ago"). The server and the browser render it moments apart, so the text
 * can differ at a boundary; that one text node may mismatch without React re-rendering the page.
 */
export function TimeAgo({ date }: { date: Date | string }) {
  return (
    <time dateTime={new Date(date).toISOString()} suppressHydrationWarning>
      {timeAgo(date)}
    </time>
  );
}
