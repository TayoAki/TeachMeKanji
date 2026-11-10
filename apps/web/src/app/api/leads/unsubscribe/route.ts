import { NextResponse } from "next/server";
import { unsubscribeLead } from "@appbuilder/core";
import { db, route } from "@/lib/server";

/**
 * Unsubscribe from the launch emails: the button on /unsubscribe, and mail clients' one-click
 * List-Unsubscribe (RFC 8058), which POSTs to the URL in the header with the token in the query.
 */
export const POST = route(async (request: Request) => {
  const fromQuery = new URL(request.url).searchParams.get("t");
  const fromBody = fromQuery
    ? null
    : ((await request.json().catch(() => ({}))) as { token?: string }).token;
  const ok = await unsubscribeLead(db(), String(fromQuery ?? fromBody ?? ""));
  return NextResponse.json({ ok });
});
