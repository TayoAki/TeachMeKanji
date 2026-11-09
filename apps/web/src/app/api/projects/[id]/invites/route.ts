import { NextResponse } from "next/server";
import { createInvite } from "@appbuilder/core";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

/** Create a single-use invite link (owner only). Works without email: share the link yourself. */
export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/invites">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "manage");
    const { role } = await readJson<{ role: "viewer" | "editor" }>(request);
    if (!["viewer", "editor"].includes(role)) throw new HttpError(400, "Invalid role.");
    const { token, expiresAt } = await createInvite(db(), {
      projectId: id,
      role,
      createdBy: viewer!.id,
    });
    const origin = (process.env.APP_PUBLIC_URL || new URL(request.url).origin).replace(/\/$/, "");
    return NextResponse.json({ url: `${origin}/invite/${token}`, expiresAt });
  },
);
