import { NextResponse } from "next/server";
import { FunnelError, saveLeadSurvey } from "@appbuilder/core";
import { db, HttpError, readJson, route } from "@/lib/server";

/** The four questions after the check (or from the link in the results email). */
export const POST = route(async (request: Request) => {
  const body = await readJson<Record<string, unknown> & { token?: string }>(request);
  try {
    await saveLeadSurvey(db(), String(body.token ?? ""), body);
  } catch (error) {
    if (error instanceof FunnelError) throw new HttpError(error.status, error.message);
    throw error;
  }
  return NextResponse.json({ ok: true });
});
