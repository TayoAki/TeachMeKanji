import { NextResponse, type NextRequest } from "next/server";
import { connectorById } from "@appbuilder/contract";
import { completeAuthorization } from "@appbuilder/core";
import { backTo, openPending, PENDING_COOKIE, pendingCookie } from "@/lib/connector-oauth";
import { db, requireViewer, route } from "@/lib/server";

/** The connector's authorization server sends the user back here with a code. */
export const GET = route(async (request: NextRequest) => {
  const viewer = await requireViewer();
  const params = request.nextUrl.searchParams;
  const pending = openPending(request.cookies.get(PENDING_COOKIE)?.value);
  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.nextUrl.origin));
    response.cookies.set(PENDING_COOKIE, "", { ...pendingCookie, maxAge: 0 });
    return response;
  };
  if (!pending || pending.userId !== viewer.id || params.get("state") !== pending.state)
    return finish(backTo("/settings", "connector_error", "That sign-in expired. Try again."));
  const name = connectorById(pending.connectorId)?.name ?? "The connector";
  const code = params.get("code");
  if (!code) {
    const reason = params.get("error_description") || params.get("error") || "sign-in cancelled";
    return finish(backTo(pending.returnTo, "connector_error", `${name}: ${reason}`));
  }
  try {
    await completeAuthorization({ db: db(), pending, code });
  } catch (error) {
    return finish(
      backTo(pending.returnTo, "connector_error", `${name}: ${(error as Error).message}`),
    );
  }
  return finish(backTo(pending.returnTo, "connected", pending.connectorId));
});
