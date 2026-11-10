CREATE TABLE "app_analytics_day" (
	"project_id" text NOT NULL,
	"day" text NOT NULL,
	"events" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "app_analytics_day_project_id_day_pk" PRIMARY KEY("project_id","day")
);
--> statement-breakpoint
CREATE TABLE "app_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"install" text NOT NULL,
	"name" text NOT NULL,
	"screen" text,
	"props" jsonb,
	"platform" text NOT NULL,
	"test" boolean DEFAULT false NOT NULL,
	"at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "analytics" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_analytics_day" ADD CONSTRAINT "app_analytics_day_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_event" ADD CONSTRAINT "app_event_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "app_event_project_at_idx" ON "app_event" USING btree ("project_id","at");--> statement-breakpoint
CREATE INDEX "app_event_received_idx" ON "app_event" USING btree ("received_at");