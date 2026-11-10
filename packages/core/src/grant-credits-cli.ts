/**
 * Operator tool: give credits to accounts straight from the database (testers, demo accounts).
 *
 *   npm run credits:grant -- --amount 1000 --key demo-2026-11 \
 *     (--email a@b.com,c@d.com | --suffix @example.com) [--note "Testing credits"]
 *
 * --key makes it safe to run again: each account gets at most one grant per key.
 */
import { parseArgs } from "node:util";
import { ilike, inArray, or } from "drizzle-orm";
import { createDb, schema } from "@appbuilder/db";
import { creditBalance, grantCredits } from "./credits";

const { values } = parseArgs({
  options: {
    amount: { type: "string" },
    key: { type: "string" },
    email: { type: "string" },
    suffix: { type: "string" },
    note: { type: "string", default: "Granted by an operator" },
  },
});
const amount = Number(values.amount);
const key = String(values.key ?? "").trim();
const emails = String(values.email ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);
const suffix = String(values.suffix ?? "")
  .trim()
  .toLowerCase();
if (!Number.isInteger(amount) || amount < 1 || amount > 10_000)
  throw new Error("--amount must be a whole number from 1 to 10000");
if (!/^[\w.-]{3,64}$/.test(key)) throw new Error("--key is required (letters, digits, . _ -)");
if (!emails.length && !/^@[a-z0-9.-]+\.[a-z]{2,}$/.test(suffix))
  throw new Error("Give --email a@b.com,… or --suffix @example.com");

const { db, pool } = createDb(
  process.env.DATABASE_URL || "postgres://appbuilder:appbuilder@localhost:5432/appbuilder",
);
const conditions = [];
if (emails.length) conditions.push(inArray(schema.user.email, emails));
if (suffix) conditions.push(ilike(schema.user.email, `%${suffix}`));
const users = await db
  .select({ id: schema.user.id, email: schema.user.email })
  .from(schema.user)
  .where(or(...conditions));
for (const user of users) {
  const granted = await grantCredits(
    db,
    user.id,
    amount,
    "grant",
    `grant:${key}:${user.id}`,
    String(values.note).slice(0, 200),
  );
  console.log(
    `credits: ${user.email} ${granted ? `+${amount}` : "already granted"} → ${await creditBalance(db, user.id)}`,
  );
}
const found = new Set(users.map((u) => u.email.toLowerCase()));
for (const email of emails.filter((e) => !found.has(e))) console.log(`credits: ${email} not found`);
await pool.end();
