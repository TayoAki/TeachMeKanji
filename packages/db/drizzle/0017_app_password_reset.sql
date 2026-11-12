CREATE TABLE "app_password_reset" (
	"app_user_id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"code_hash" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "app_password_reset" ADD CONSTRAINT "app_password_reset_app_user_id_app_user_id_fk" FOREIGN KEY ("app_user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_password_reset" ADD CONSTRAINT "app_password_reset_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;