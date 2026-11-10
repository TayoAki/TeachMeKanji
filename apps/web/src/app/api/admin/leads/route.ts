import { NextResponse } from "next/server";
import { isAdminToken, listLeads } from "@appbuilder/core";
import { db, HttpError, route } from "@/lib/server";

/**
 * Funnel leads with their check score, survey answers and whether they signed up, for the
 * operator. ADMIN_API_TOKEN as a Bearer token; without it set, the route doesn't exist.
 *   curl $BETTER_AUTH_URL/api/admin/leads -H "Authorization: Bearer $ADMIN_API_TOKEN"
 */
export const GET = route(async (request: Request) => {
  if (!isAdminToken(request.headers.get("authorization"))) throw new HttpError(404, "Not found.");
  return NextResponse.json({ leads: await listLeads(db()) });
});
