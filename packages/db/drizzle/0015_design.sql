CREATE TABLE "project_design" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" text DEFAULT 'generating' NOT NULL,
	"direction" jsonb,
	"screens" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"mascot" jsonb,
	"cost_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "plan" ADD COLUMN "research" jsonb;--> statement-breakpoint
ALTER TABLE "worker_heartbeat" ADD COLUMN "design" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "project_design" ADD CONSTRAINT "project_design_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_design" ADD CONSTRAINT "project_design_plan_id_plan_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plan"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_design_project_idx" ON "project_design" USING btree ("project_id","created_at");