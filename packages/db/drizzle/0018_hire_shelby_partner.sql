CREATE TABLE "support_ai_usage" (
	"project_id" text NOT NULL,
	"day" text NOT NULL,
	"replies" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"credits_charged" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "support_ai_usage_project_id_day_pk" PRIMARY KEY("project_id","day")
);
--> statement-breakpoint
CREATE TABLE "support_workspace" (
	"user_id" text PRIMARY KEY NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"ai_allowed" boolean DEFAULT true NOT NULL,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sync_cursor" (
	"name" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "support_chat" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "support_chat_app_id" text;--> statement-breakpoint
ALTER TABLE "support_ai_usage" ADD CONSTRAINT "support_ai_usage_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "support_workspace" ADD CONSTRAINT "support_workspace_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;