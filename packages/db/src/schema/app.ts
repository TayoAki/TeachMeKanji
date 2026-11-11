import {
  bigserial,
  boolean,
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
    /** Where the generated app keeps its data: on the device, or in App Cloud. */
    backend: text("backend").$type<"local" | "cloud">().notNull().default("local"),
    /** Whether the generated app sends usage events (the Analytics tab's switch). */
    analytics: boolean("analytics").notNull().default(false),
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
    /** "reference": private prompt images; "app_image": shipped in the app, served publicly. */
    purpose: text("purpose").$type<"reference" | "app_image">().notNull().default("reference"),
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
    /** Set when the member joined through an invite link: access then needs no email check. */
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.projectId, t.email] }),
    index("project_member_email_idx").on(t.email),
    index("project_member_user_idx").on(t.userId),
  ],
);

/** Single-use invite links: whoever accepts one, signed in, joins with its role. */
export const projectInvite = pgTable(
  "project_invite",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id")
      .notNull()
      .references(() => project.id, { onDelete: "cascade" }),
    role: text("role").$type<"viewer" | "editor">().notNull(),
    /** sha256 of the token in the link; the token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    usedAt: timestamp("used_at", { withTimezone: true }),
    usedBy: text("used_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [index("project_invite_project_idx").on(t.projectId)],
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

export type VersionKind = "generate" | "ai_edit" | "inline_edit" | "restore" | "theme";

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

export type RunKind =
  | "plan"
  | "build"
  | "edit"
  | "review"
  | "device_preview"
  | "github_push"
  | "native_build"
  /** Create the app's products, entitlement and offering in the user's RevenueCat. */
  | "payments_setup"
  /** Write the App Store / Google Play listing (name, description, keywords, captions). */
  | "store_listing"
  /** Write a promo video's storyboard (hook, screens with captions, tagline, call to action). */
  | "promo_storyboard"
  /** Render a promo video of the app from its storyboard and captured screens. */
  | "promo_render";
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

export type LedgerReason =
  | "grant"
  | "reserve"
  | "release"
  | "settle"
  | "purchase"
  | "monthly"
  /** AI features inside the owner's generated apps (App Cloud /ai), metered per day. */
  | "app_ai";

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
  plan: text("plan").$type<"free" | "builder" | "pro">().notNull().default("free"),
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
    /** "expo", or a connector id from the contract ("github" serves both export and the agent). */
    provider: text("provider").notNull(),
    encryptedToken: text("encrypted_token").notNull(),
    label: text("label"),
    /** "token" (pasted) or "oauth" (signed in; refreshed by the platform). */
    auth: text("auth").$type<"token" | "oauth">().notNull().default("token"),
    encryptedRefreshToken: text("encrypted_refresh_token"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    /** Where and as which client to refresh an OAuth token. */
    oauth: jsonb("oauth").$type<{ clientId: string; tokenEndpoint: string; resource: string }>(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.provider] })],
);

/** OAuth clients the platform registered with a connector's authorization server (RFC 7591). */
export const connectorClient = pgTable(
  "connector_client",
  {
    connectorId: text("connector_id").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    clientId: text("client_id").notNull(),
    encryptedClientSecret: text("encrypted_client_secret"),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.connectorId, t.redirectUri] })],
);

export const deviceSession = pgTable("device_session", {
  projectId: text("project_id")
    .primaryKey()
    .references(() => project.id, { onDelete: "cascade" }),
  versionId: text("version_id"),
  /** Whose Expo account the dev server runs as (Expo Go on iPhone must be signed in as them). */
  userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
  status: text("status").$type<"starting" | "running" | "stopped" | "error">().notNull(),
  url: text("url"),
  port: integer("port"),
  error: text("error"),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: updatedAt(),
});

/** Each running worker and what it can do, refreshed every 30 seconds. */
export const workerHeartbeat = pgTable("worker_heartbeat", {
  id: text("id").primaryKey(),
  devicePreviews: boolean("device_previews").notNull(),
  seenAt: timestamp("seen_at", { withTimezone: true }).notNull().defaultNow(),
});
