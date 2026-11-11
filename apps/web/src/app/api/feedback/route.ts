import { NextResponse } from "next/server";
import { getStorage, listUserFeedback, submitFeedback } from "@appbuilder/core";
import { db, HttpError, requireViewer, route } from "@/lib/server";

/** Send a bug report, feature request or other note (multipart, with up to 3 screenshots). */
export const POST = route(async (request: Request) => {
  const viewer = await requireViewer();
  const form = await request.formData().catch(() => {
    throw new HttpError(400, "Send the report as a form.");
  });
  const images: Buffer[] = [];
  for (const value of form.getAll("images")) {
    if (typeof value === "string") continue;
    if (value.size > 5 * 1024 * 1024)
      throw new HttpError(413, "Each screenshot must be under 5 MB.");
    images.push(Buffer.from(await value.arrayBuffer()));
  }
  let context: unknown = {};
  try {
    context = JSON.parse(String(form.get("context") ?? "{}"));
  } catch {
    // Context is optional.
  }
  const row = await submitFeedback(db(), getStorage(), {
    viewer,
    kind: form.get("kind"),
    title: form.get("title"),
    body: form.get("body"),
    projectId: String(form.get("projectId") ?? "") || null,
    // Technical details are the sender's choice: the browser only goes in with them.
    context:
      form.get("details") === "0"
        ? context
        : { ...(context as object), userAgent: request.headers.get("user-agent") ?? undefined },
    includeRunError: form.get("details") !== "0",
    images,
  });
  return NextResponse.json({ id: row.id });
});

/** The viewer's own reports, with their status and the team's reply. */
export const GET = route(async () => {
  const viewer = await requireViewer();
  const rows = await listUserFeedback(db(), viewer.id);
  return NextResponse.json({
    feedback: rows.map((f) => ({
      id: f.id,
      kind: f.kind,
      title: f.title,
      body: f.body,
      status: f.status,
      reply: f.reply,
      images: f.images.length,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    })),
  });
});
