import {
  bigserial,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { user } from "./auth";

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export type ProjectStatus =
  "draft" | "planning" | "awaiting_confirmation" | "building" | "ready" | "error";

export const project = pgTable(
  "project",
  {
    id: text("id").primaryKey(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    prompt: text("prompt").notNull(),
    platforms: text("platforms").$type<"ios" | "android" | "both">().notNull().default("both"),
    status: text("status").$type<ProjectStatus>().notNull().default("draft"),
    visibility: text("visibility").$type<"private" | "public">().notNull().default("private"),
    activeThemeId: text("active_theme_id"),
    currentVersionId: text("current_version_id"),
    publishedSlug: text("published_slug").unique(),
    publishedVersionId: text("published_version_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (t) => [
    index("project_owner_idx").on(t.ownerId),
    index("project_visibility_idx").on(t.visibility),
  ],
);

export const projectAsset = pgTable(
  "project_asset",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(),
    fileName: text("file_name").notNull(),
    mime: text("mime").notNull(),
    bytes: integer("bytes").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("project_asset_project_idx").on(t.projectId)],
);

export const projectMember = pgTable(
  "project_member",
  {
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role").$type<"viewer" | "editor">().notNull().default("viewer"),
    invitedBy: text("invited_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.email] }),
    index("project_member_email_idx").on(t.email),
  ],
);

export type MessageKind = "text" | "plan" | "run" | "error";

export const message = pgTable(
  "message",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    role: text("role").$type<"user" | "assistant">().notNull(),
    kind: text("kind").$type<MessageKind>().notNull().default("text"),
    /** text, attachment ids, plan id, run id, selection reference … */
    content: jsonb("content").$type<Record<string, unknown>>().notNull(),
    runId: text("run_id"),
    createdAt: createdAt(),
  },
  (t) => [index("message_project_idx").on(t.projectId, t.createdAt)],
);

export const plan = pgTable(
  "plan",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    data: jsonb("data").$type<Record<string, unknown>>().notNull(),
    status: text("status")
      .$type<"proposed" | "confirmed" | "superseded">()
      .notNull()
      .default("proposed"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("plan_project_number_idx").on(t.projectId, t.number)],
);

export type VersionKind = "generate" | "ai_edit" | "inline_edit" | "restore";

export const projectVersion = pgTable(
  "project_version",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    number: integer("number").notNull(),
    parentId: text("parent_id"),
    runId: text("run_id"),
    kind: text("kind").$type<VersionKind>().notNull(),
    summary: text("summary").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("project_version_number_idx").on(t.projectId, t.number)],
);

export const blob = pgTable("blob", {
  hash: text("hash").primaryKey(),
  content: text("content").notNull(),
  bytes: integer("bytes").notNull(),
});

export const versionFile = pgTable(
  "version_file",
  {
    versionId: text("version_id")
      .notNull()
      .references(() => projectVersion.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    blobHash: text("blob_hash")
      .notNull()
      .references(() => blob.hash),
  },
  (t) => [primaryKey({ columns: [t.versionId, t.path] })],
);

export type RunKind = "plan" | "build" | "edit" | "device_preview" | "github_push" | "native_build";
export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export const agentRun = pgTable(
  "agent_run",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    kind: text("kind").$type<RunKind>().notNull(),
    status: text("status").$type<RunStatus>().notNull().default("queued"),
    input: jsonb("input").$type<Record<string, unknown>>().notNull().default({}),
    output: jsonb("output").$type<Record<string, unknown>>(),
    error: text("error"),
    model: text("model"),
    tokensIn: integer("tokens_in").notNull().default(0),
    tokensOut: integer("tokens_out").notNull().default(0),
    cacheReadTokens: integer("cache_read_tokens").notNull().default(0),
    cacheWriteTokens: integer("cache_write_tokens").notNull().default(0),
    creditsReserved: integer("credits_reserved").notNull().default(0),
    creditsCharged: integer("credits_charged").notNull().default(0),
    attempts: integer("attempts").notNull().default(0),
    cancelRequested: integer("cancel_requested").notNull().default(0),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    startedAt: timestamp("started_at", { withTimezone: true }),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index("agent_run_queue_idx").on(t.status, t.createdAt),
    index("agent_run_project_idx").on(t.projectId, t.createdAt),
  ],
);

export const runEvent = pgTable(
  "run_event",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    runId: text("run_id")
      .notNull()
      .references(() => agentRun.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [index("run_event_run_idx").on(t.runId, t.id)],
);

export type LedgerReason = "grant" | "reserve" | "release" | "settle" | "purchase" | "monthly";

export const creditLedger = pgTable(
  "credit_ledger",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    delta: integer("delta").notNull(),
    reason: text("reason").$type<LedgerReason>().notNull(),
    runId: text("run_id"),
    note: text("note"),
    externalId: text("external_id").unique(),
    createdAt: createdAt(),
  },
  (t) => [index("credit_ledger_user_idx").on(t.userId)],
);

export const subscription = pgTable("subscription", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  plan: text("plan").$type<"free" | "pro">().notNull().default("free"),
  status: text("status").notNull().default("active"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  updatedAt: updatedAt(),
});

export const integration = pgTable(
  "integration",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").$type<"github" | "expo">().notNull(),
    encryptedToken: text("encrypted_token").notNull(),
    label: text("label"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);

export const deviceSession = pgTable("device_session", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => project.id, { onDelete: "cascade" }),
  versionId: text("version_id"),
  status: text("status").$type<"starting" | "running" | "stopped" | "error">().notNull(),
  url: text("url"),
  port: integer("port"),
  error: text("error"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: updatedAt(),
});
