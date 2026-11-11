import { NextResponse } from "next/server";
import { FEEDBACK_KINDS, FEEDBACK_STATUSES, listFeedback } from "@appbuilder/core";
import { db, requireAdmin, route } from "@/lib/server";

/**
 * Every report, newest first, for triage: an admin's session (ADMIN_EMAILS) or
 *   curl "$BETTER_AUTH_URL/api/admin/feedback?status=new" -H "Authorization: Bearer $ADMIN_API_TOKEN"
 */
export const GET = route(async (request: Request) => {
  await requireAdmin(request);
  const params = new URL(request.url).searchParams;
  const rows = await listFeedback(db(), {
    status: FEEDBACK_STATUSES.find((s) => s === params.get("status")),
    kind: FEEDBACK_KINDS.find((k) => k === params.get("kind")),
  });
  return NextResponse.json({
    feedback: rows.map((r) => ({
      ...r.feedback,
      images: r.feedback.images.length,
      user: { email: r.userEmail, name: r.userName },
      projectName: r.projectName,
    })),
  });
});
