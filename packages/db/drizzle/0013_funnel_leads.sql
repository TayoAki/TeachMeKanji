CREATE TABLE "lead" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"token" text NOT NULL,
	"source" text DEFAULT 'check' NOT NULL,
	"answers" jsonb NOT NULL,
	"passed" integer NOT NULL,
	"total" integer NOT NULL,
	"nurture" boolean DEFAULT false NOT NULL,
	"survey" jsonb,
	"emails_sent" integer DEFAULT 0 NOT NULL,
	"next_email_at" timestamp with time zone,
	"unsubscribed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "lead_email_unique" UNIQUE("email"),
	CONSTRAINT "lead_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE INDEX "lead_next_email_idx" ON "lead" USING btree ("next_email_at");