import { NextResponse, type NextRequest } from "next/server";
import { connectorById } from "@appbuilder/contract";
import { startAuthorization } from "@appbuilder/core";
import {
  backTo,
  connectorRedirectUri,
  PENDING_COOKIE,
  pendingCookie,
  safeReturnTo,
  sealPending,
} from "@/lib/connector-oauth";
import { appOrigin } from "@/lib/auth";
import { db, HttpError, requireViewer, route } from "@/lib/server";

/** Start signing in to a connector: register with its server if needed, then redirect there. */
export const GET = route(
  async (request: NextRequest, ctx: RouteContext<"/api/connectors/[id]/authorize">) => {
    const viewer = await requireViewer();
    const { id } = await ctx.params;
    const connector = connectorById(id);
    if (!connector?.oauth || connector.unavailable)
      throw new HttpError(404, "This connector can't be connected by signing in.");
    const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));
    try {
      const { url, pending } = await startAuthorization({
        db: db(),
        connector,
        userId: viewer.id,
        redirectUri: connectorRedirectUri(),
        returnTo,
      });
      const response = NextResponse.redirect(url);
      response.cookies.set(PENDING_COOKIE, sealPending(pending), pendingCookie);
      return response;
    } catch (error) {
      return NextResponse.redirect(
        new URL(
          backTo(returnTo, "connector_error", `${connector.name}: ${(error as Error).message}`),
          appOrigin,
        ),
      );
    }
  },
);
