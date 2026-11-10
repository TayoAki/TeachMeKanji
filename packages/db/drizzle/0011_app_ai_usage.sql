CREATE TABLE "app_ai_usage" (
	"project_id" text NOT NULL,
	"day" text NOT NULL,
	"calls" integer DEFAULT 0 NOT NULL,
	"cost_micro_usd" bigint DEFAULT 0 NOT NULL,
	"credits_charged" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "app_ai_usage_project_id_day_pk" PRIMARY KEY("project_id","day")
);
--> statement-breakpoint
ALTER TABLE "app_ai_usage" ADD CONSTRAINT "app_ai_usage_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;