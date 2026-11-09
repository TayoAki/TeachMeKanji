import { NextResponse } from "next/server";
import { acceptInvite, InviteInvalid } from "@appbuilder/core";
import { db, HttpError, readJson, requireViewer, route } from "@/lib/server";

export const POST = route(async (request: Request) => {
  const viewer = await requireViewer();
  const { token } = await readJson<{ token: string }>(request);
  try {
    return NextResponse.json(await acceptInvite(db(), String(token ?? ""), viewer));
  } catch (error) {
    if (error instanceof InviteInvalid) throw new HttpError(410, error.message);
    throw error;
  }
});
