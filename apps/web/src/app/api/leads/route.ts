import { NextResponse } from "next/server";
import {
  FunnelError,
  funnelEmail,
  markResultsSent,
  recordLead,
  sendEmail,
  WindowLimiter,
} from "@appbuilder/core";
import { clientIp } from "@/lib/client-ip";
import { db, HttpError, readJson, route } from "@/lib/server";
import { publicAppUrl } from "@/lib/template";

const perAddress = new WindowLimiter(10, 60 * 60_000);

/**
 * The App Store readiness check (/check): score the answers, record the lead, send the results
 * email, and return the results so the page shows them at once (email or not).
 */
export const POST = route(async (request: Request) => {
  const body = await readJson<{
    email?: string;
    answers?: Record<string, unknown>;
    nurture?: boolean;
    website?: string;
  }>(request);
  // Honeypot: people never see this field; bots fill it.
  if (body.website) return NextResponse.json({ ok: true });
  if (!perAddress.take(clientIp(request)))
    throw new HttpError(429, "Too many checks from this network. Try again later.");
  try {
    const { lead, passed, total, failed } = await recordLead(db(), {
      email: String(body.email ?? ""),
      answers: body.answers ?? {},
      nurture: body.nurture === true,
    });
    const results = funnelEmail(1, lead, publicAppUrl(request));
    if (results && (await sendEmail({ to: lead.email, ...results })))
      await markResultsSent(db(), lead.id);
    return NextResponse.json({
      token: lead.token,
      passed,
      total,
      failed: failed.map(({ id, question, fix, why }) => ({ id, question, fix, why })),
    });
  } catch (error) {
    if (error instanceof FunnelError) throw new HttpError(error.status, error.message);
    throw error;
  }
});
