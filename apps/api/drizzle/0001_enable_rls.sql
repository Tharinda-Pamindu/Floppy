-- Row Level Security on, with no policies: Supabase's anon and authenticated
-- roles (used by the public API keys) can read and write nothing. Only the
-- API's own database connection (the table owner) reaches the data.
ALTER TABLE "users" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_settings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "user_suspensions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organizations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "organization_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "teams" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_memberships" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "team_repos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "weekly_plans" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "assigned_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_tasks" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "plan_reviews" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "conversation_reads" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "messages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_page_versions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "reminder_sends" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_deletion_requests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "admin_audit_log" ENABLE ROW LEVEL SECURITY;
