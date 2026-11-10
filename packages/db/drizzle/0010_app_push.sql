CREATE TABLE "app_push_broadcast" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"sent" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_push_token" (
	"token" text NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"platform" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_push_token_project_id_token_pk" PRIMARY KEY("project_id","token")
);
--> statement-breakpoint
ALTER TABLE "app_push_broadcast" ADD CONSTRAINT "app_push_broadcast_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_push_token" ADD CONSTRAINT "app_push_token_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_push_token" ADD CONSTRAINT "app_push_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_push_broadcast_project_idx" ON "app_push_broadcast" USING btree ("project_id","created_at");