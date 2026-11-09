CREATE TABLE "agent_run" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'queued' NOT NULL,
	"input" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"model" text,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cache_read_tokens" integer DEFAULT 0 NOT NULL,
	"cache_write_tokens" integer DEFAULT 0 NOT NULL,
	"credits_reserved" integer DEFAULT 0 NOT NULL,
	"credits_charged" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"cancel_requested" integer DEFAULT 0 NOT NULL,
	"heartbeat_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "blob" (
	"hash" text PRIMARY KEY NOT NULL,
	"content" text NOT NULL,
	"bytes" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credit_ledger" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"delta" integer NOT NULL,
	"reason" text NOT NULL,
	"run_id" text,
	"note" text,
	"external_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "credit_ledger_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "device_session" (
	"project_id" text PRIMARY KEY NOT NULL,
	"version_id" text,
	"status" text NOT NULL,
	"url" text,
	"port" integer,
	"error" text,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integration" (
	"user_id" text NOT NULL,
	"provider" text NOT NULL,
	"encrypted_token" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integration_user_id_provider_pk" PRIMARY KEY("user_id","provider")
);
--> statement-breakpoint
CREATE TABLE "message" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text,
	"role" text NOT NULL,
	"kind" text DEFAULT 'text' NOT NULL,
	"content" jsonb NOT NULL,
	"run_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "plan" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"number" integer NOT NULL,
	"data" jsonb NOT NULL,
	"status" text DEFAULT 'proposed' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project" (
	"id" text PRIMARY KEY NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"prompt" text NOT NULL,
	"platforms" text DEFAULT 'both' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"visibility" text DEFAULT 'private' NOT NULL,
	"active_theme_id" text,
	"current_version_id" text,
	"published_slug" text,
	"published_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "project_published_slug_unique" UNIQUE("published_slug")
);
--> statement-breakpoint
CREATE TABLE "project_asset" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" text NOT NULL,
	"mime" text NOT NULL,
	"bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "project_member" (
	"project_id" text NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'viewer' NOT NULL,
	"invited_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_member_project_id_email_pk" PRIMARY KEY("project_id","email")
);
--> statement-breakpoint
CREATE TABLE "project_version" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"number" integer NOT NULL,
	"parent_id" text,
	"run_id" text,
	"kind" text NOT NULL,
	"summary" text NOT NULL,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "run_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"run_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "subscription" (
	"user_id" text PRIMARY KEY NOT NULL,
	"plan" text DEFAULT 'free' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"current_period_end" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "version_file" (
	"version_id" text NOT NULL,
	"path" text NOT NULL,
	"blob_hash" text NOT NULL,
	CONSTRAINT "version_file_version_id_path_pk" PRIMARY KEY("version_id","path")
);
--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_run" ADD CONSTRAINT "agent_run_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_ledger" ADD CONSTRAINT "credit_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "device_session" ADD CONSTRAINT "device_session_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integration" ADD CONSTRAINT "integration_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "message" ADD CONSTRAINT "message_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan" ADD CONSTRAINT "plan_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_asset" ADD CONSTRAINT "project_asset_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_member" ADD CONSTRAINT "project_member_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_version" ADD CONSTRAINT "project_version_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_version" ADD CONSTRAINT "project_version_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_event" ADD CONSTRAINT "run_event_run_id_agent_run_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."agent_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subscription" ADD CONSTRAINT "subscription_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_file" ADD CONSTRAINT "version_file_version_id_project_version_id_fk" FOREIGN KEY ("version_id") REFERENCES "public"."project_version"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "version_file" ADD CONSTRAINT "version_file_blob_hash_blob_hash_fk" FOREIGN KEY ("blob_hash") REFERENCES "public"."blob"("hash") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agent_run_queue_idx" ON "agent_run" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "agent_run_project_idx" ON "agent_run" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE INDEX "credit_ledger_user_idx" ON "credit_ledger" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "message_project_idx" ON "message" USING btree ("project_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "plan_project_number_idx" ON "plan" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "project_owner_idx" ON "project" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "project_visibility_idx" ON "project" USING btree ("visibility");--> statement-breakpoint
CREATE INDEX "project_asset_project_idx" ON "project_asset" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "project_member_email_idx" ON "project_member" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "project_version_number_idx" ON "project_version" USING btree ("project_id","number");--> statement-breakpoint
CREATE INDEX "run_event_run_idx" ON "run_event" USING btree ("run_id","id");