CREATE TABLE "app_error" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"fingerprint" text NOT NULL,
	"message" text NOT NULL,
	"stack" text,
	"screen" text,
	"platform" text NOT NULL,
	"fatal" boolean DEFAULT false NOT NULL,
	"test" boolean DEFAULT true NOT NULL,
	"count" integer DEFAULT 1 NOT NULL,
	"first_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "app_error" ADD CONSTRAINT "app_error_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "app_error_fingerprint_idx" ON "app_error" USING btree ("project_id","fingerprint");--> statement-breakpoint
CREATE INDEX "app_error_project_seen_idx" ON "app_error" USING btree ("project_id","last_seen");