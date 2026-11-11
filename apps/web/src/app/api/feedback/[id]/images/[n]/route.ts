import { feedbackImage, getStorage, isAdminEmail } from "@appbuilder/core";
import { db, HttpError, requireViewer, route } from "@/lib/server";

/** A report's screenshot, for the person who sent it and the operator. */
export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/feedback/[id]/images/[n]">) => {
    const { id, n } = await ctx.params;
    const viewer = await requireViewer();
    const image = await feedbackImage(db(), getStorage(), id, Number(n), {
      id: viewer.id,
      admin: isAdminEmail(viewer.email),
    });
    if (!image) throw new HttpError(404, "Not found.");
    return new Response(new Uint8Array(image.data), {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=3600",
        "X-Content-Type-Options": "nosniff",
      },
    });
  },
);
