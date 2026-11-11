import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { project } from "./app";
import { user } from "./auth";

export type FeedbackKind = "bug" | "request" | "other";
export type FeedbackStatus = "new" | "planned" | "in_progress" | "done" | "wont_do";

/** What the builder attaches to a report so it can be reproduced. */
export interface FeedbackContext {
  /** The page the report was sent from, e.g. "/projects/p_123". */
  path?: string;
  userAgent?: string;
  viewport?: string;
  /** The builder's own recent errors in that browser tab (never the generated app's). */
  errors?: string[];
  /** The project's most recent failed run, when there is one. */
  lastFailedRun?: { kind: string; error: string; at: string };
  /** The deployed commit, when the host provides it. */
  build?: string;
}

/** Bug reports, feature requests and other notes users send from the builder. */
export const feedback = pgTable(
  "feedback",
  {
    id: text("id").primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** The project it was sent from; kept when the project is deleted, as null. */
    projectId: text("project_id").references(() => project.id, { onDelete: "set null" }),
    kind: text("kind").$type<FeedbackKind>().notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    status: text("status").$type<FeedbackStatus>().notNull().default("new"),
    context: jsonb("context").$type<FeedbackContext>().notNull().default({}),
    /** Storage keys of attached screenshots. */
    images: jsonb("images").$type<string[]>().notNull().default([]),
    /** The team's answer, shown to the user with the status. */
    reply: text("reply"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("feedback_user_idx").on(t.userId, t.createdAt),
    index("feedback_status_idx").on(t.status, t.createdAt),
  ],
);
