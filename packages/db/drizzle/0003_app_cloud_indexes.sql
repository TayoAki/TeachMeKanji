DROP INDEX "app_user_project_idx";--> statement-breakpoint
CREATE INDEX "app_session_expires_idx" ON "app_session" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "app_user_project_created_idx" ON "app_user" USING btree ("project_id","created_at");