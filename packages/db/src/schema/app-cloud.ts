import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { project } from "./app";

/**
 * App Cloud: the built-in backend generated apps use once it's enabled for a project.
 * Users and records belong to the generated app (its end users), not to the platform.
 */
export const appUser = pgTable(
  "app_user",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    /** null for anonymous (device) users until they sign up. */
    email: text("email"),
    name: text("name"),
    passwordHash: text("password_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("app_user_email_idx").on(t.projectId, t.email),
    // Also serves the "new devices in the last minute" check.
    index("app_user_project_created_idx").on(t.projectId, t.createdAt),
  ],
);

export const appSession = pgTable(
  "app_session",
  {
    /** sha256 of the bearer token; the token itself is never stored. */
    tokenHash: text("token_hash").primaryKey(),
    appUserId: text("app_user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("app_session_user_idx").on(t.appUserId),
    index("app_session_expires_idx").on(t.expiresAt),
  ],
);

export const appRecord = pgTable(
  "app_record",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    ownerId: text("owner_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    collection: text("collection").notNull(),
    id: text("id").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.ownerId, t.collection, t.id] }),
    index("app_record_project_collection_idx").on(t.projectId, t.collection),
  ],
);

/** Expo push tokens of an app's users who allowed notifications (registerForPush()). */
export const appPushToken = pgTable(
  "app_push_token",
  {
    token: text("token").notNull(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    platform: text("platform").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.token] })],
);

/** Notifications an app's owner sent to its users (history, and the daily limit). */
export const appPushBroadcast = pgTable(
  "app_push_broadcast",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    body: text("body").notNull(),
    sent: jsonb("sent").$type<{ ok: number; failed: number; removed: number }>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("app_push_broadcast_project_idx").on(t.projectId, t.createdAt)],
);

/** AI calls made by a generated app (App Cloud /ai) per day: what the owner's credits paid for. */
export const appAiUsage = pgTable(
  "app_ai_usage",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    /** UTC date, YYYY-MM-DD. */
    day: text("day").notNull(),
    calls: integer("calls").notNull().default(0),
    /** Measured model cost in millionths of a dollar. */
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull().default(0),
    creditsCharged: integer("credits_charged").notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.day] })],
);
