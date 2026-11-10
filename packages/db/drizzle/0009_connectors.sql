CREATE TABLE "connector_client" (
	"connector_id" text NOT NULL,
	"redirect_uri" text NOT NULL,
	"client_id" text NOT NULL,
	"encrypted_client_secret" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "connector_client_connector_id_redirect_uri_pk" PRIMARY KEY("connector_id","redirect_uri")
);
--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "auth" text DEFAULT 'token' NOT NULL;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "encrypted_refresh_token" text;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "integration" ADD COLUMN "oauth" jsonb;