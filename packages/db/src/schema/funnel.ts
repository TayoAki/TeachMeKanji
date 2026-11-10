import { boolean, index, integer, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

/**
 * People who took the App Store readiness check (/check). One row per email; taking the check
 * again updates it. `token` is the unguessable key in survey and unsubscribe links.
 */
export const lead = pgTable(
  "lead",
  {
    id: text("id").primaryKey(),
    /** Lower-cased. */
    email: text("email").notNull().unique(),
    token: text("token").notNull().unique(),
    source: text("source").notNull().default("check"),
    answers: jsonb("answers").$type<Record<string, string>>().notNull(),
    passed: integer("passed").notNull(),
    total: integer("total").notNull(),
    /** Asked for the launch emails (the results email is sent either way). */
    nurture: boolean("nurture").notNull().default(false),
    survey: jsonb("survey").$type<Record<string, unknown>>(),
    /** Funnel emails sent so far (1 = the results email). */
    emailsSent: integer("emails_sent").notNull().default(0),
    nextEmailAt: timestamp("next_email_at", { withTimezone: true }),
    unsubscribedAt: timestamp("unsubscribed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("lead_next_email_idx").on(t.nextEmailAt)],
);
