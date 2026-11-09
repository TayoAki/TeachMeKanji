import { NextResponse } from "next/server";
import { listMembers, shareProject, unshareProject } from "@appbuilder/core";
import { db, HttpError, readJson, requireProject, route } from "@/lib/server";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const GET = route(
  async (_request: Request, ctx: RouteContext<"/api/projects/[id]/members">) => {
    const { id } = await ctx.params;
    await requireProject(id, "edit");
    const members = await listMembers(db(), id);
    return NextResponse.json({
      members: members.map((m) => ({ email: m.email, role: m.role, createdAt: m.createdAt })),
    });
  },
);

export const POST = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/members">) => {
    const { id } = await ctx.params;
    const { viewer } = await requireProject(id, "manage");
    const body = await readJson<{ email: string; role: "viewer" | "editor" }>(request);
    const email = String(body.email ?? "")
      .trim()
      .toLowerCase();
    if (!EMAIL.test(email)) throw new HttpError(400, "Enter a valid email address.");
    if (email === viewer!.email.toLowerCase())
      throw new HttpError(400, "You already own this project.");
    if (!["viewer", "editor"].includes(body.role)) throw new HttpError(400, "Invalid role.");
    await shareProject(db(), id, email, body.role, viewer!.id);
    return NextResponse.json({ ok: true });
  },
);

export const DELETE = route(
  async (request: Request, ctx: RouteContext<"/api/projects/[id]/members">) => {
    const { id } = await ctx.params;
    await requireProject(id, "manage");
    const email = new URL(request.url).searchParams.get("email") ?? "";
    await unshareProject(db(), id, email);
    return NextResponse.json({ ok: true });
  },
);
