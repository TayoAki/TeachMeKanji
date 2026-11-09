CREATE TABLE "app_record" (
	"project_id" text NOT NULL,
	"owner_id" text NOT NULL,
	"collection" text NOT NULL,
	"id" text NOT NULL,
	"data" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_record_project_id_owner_id_collection_id_pk" PRIMARY KEY("project_id","owner_id","collection","id")
);
--> statement-breakpoint
CREATE TABLE "app_session" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"app_user_id" text NOT NULL,
	"project_id" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_user" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"email" text,
	"name" text,
	"password_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "backend" text DEFAULT 'local' NOT NULL;--> statement-breakpoint
ALTER TABLE "app_record" ADD CONSTRAINT "app_record_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_record" ADD CONSTRAINT "app_record_owner_id_app_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_session" ADD CONSTRAINT "app_session_app_user_id_app_user_id_fk" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_session" ADD CONSTRAINT "app_session_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_record_project_collection_idx" ON "app_record" USING btree ("project_id","collection");--> statement-breakpoint
CREATE INDEX "app_session_user_idx" ON "app_session" USING btree ("app_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "app_user_email_idx" ON "app_user" USING btree ("project_id","email");--> statement-breakpoint
CREATE INDEX "app_user_project_idx" ON "app_user" USING btree ("project_id");