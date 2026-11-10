import { randomUUID } from "node:crypto";
import { ilike, inArray, or } from "drizzle-orm";
import { NextResponse } from "next/server";
import { creditBalance, grantCredits, isAdminToken } from "@appbuilder/core";
import { schema } from "@appbuilder/db";
import { db, HttpError, readJson, route } from "@/lib/server";

const MAX_GRANT = 10_000;

/**
 * Operator tool: give credits to accounts by email (testers, demo accounts). Authenticated with
 * ADMIN_API_TOKEN as a Bearer token, never a session; without the token set it doesn't exist.
 *
 *   curl -X POST $BETTER_AUTH_URL/api/admin/credits -H "Authorization: Bearer $ADMIN_API_TOKEN" \
 *     -H "content-type: application/json" -d '{"emails":["a@b.com"],"amount":500,"note":"Testing"}'
 *
 * `emailSuffix` (e.g. "@example.com") grants to every account whose email ends with it.
 */
export const POST = route(async (request: Request) => {
  if (!isAdminToken(request.headers.get("authorization"))) throw new HttpError(404, "Not found.");
  const body = await readJson<{
    emails?: string[];
    emailSuffix?: string;
    amount?: number;
    note?: string;
  }>(request);
  const amount = Number(body.amount);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_GRANT)
    throw new HttpError(400, `amount must be a whole number from 1 to ${MAX_GRANT}.`);
  const emails = (body.emails ?? []).map((e) => String(e).trim().toLowerCase()).filter(Boolean);
  const suffix = String(body.emailSuffix ?? "")
    .trim()
    .toLowerCase();
  if (!emails.length && !/^@[a-z0-9.-]+\.[a-z]{2,}$/.test(suffix))
    throw new HttpError(400, "Give emails, or an emailSuffix like @example.com.");

  const conditions = [];
  if (emails.length) conditions.push(inArray(schema.user.email, emails));
  if (suffix) conditions.push(ilike(schema.user.email, `%${suffix}`));
  const users = await db()
    .select({ id: schema.user.id, email: schema.user.email })
    .from(schema.user)
    .where(or(...conditions));

  const note = String(body.note ?? "Granted by an operator").slice(0, 200);
  const granted = [];
  for (const user of users) {
    await grantCredits(db(), user.id, amount, "grant", `admin:${randomUUID()}`, note);
    granted.push({ email: user.email, balance: await creditBalance(db(), user.id) });
  }
  const found = new Set(users.map((u) => u.email.toLowerCase()));
  return NextResponse.json({
    amount,
    granted,
    notFound: emails.filter((e) => !found.has(e)),
  });
});
