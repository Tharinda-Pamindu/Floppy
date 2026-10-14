CREATE TABLE "admin_audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text,
	"operation" text NOT NULL,
	"outcome" text NOT NULL,
	"error_kind" text,
	"model" text NOT NULL,
	"latency_ms" integer DEFAULT 0 NOT NULL,
	"input_tokens" integer,
	"output_tokens" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_ai_usage_op" CHECK (operation IN ('plan_review', 'plan_draft')),
	CONSTRAINT "ck_ai_usage_outcome" CHECK (outcome IN ('succeeded', 'failed', 'rate_limited'))
);
--> statement-breakpoint
CREATE TABLE "assigned_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"team_id" uuid,
	"title" text NOT NULL,
	"description" text,
	"assignee_id" text NOT NULL,
	"assigned_by_id" text,
	"deadline" timestamp with time zone NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"status" text DEFAULT 'todo' NOT NULL,
	"completed_at" timestamp with time zone,
	"github_repo_id" uuid,
	"github_issue_number" integer,
	"github_issue_url" text,
	"github_issue_title" text,
	"github_issue_state" text,
	"github_synced_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "ck_assigned_task_status" CHECK (status IN ('todo', 'in_progress', 'done', 'cancelled')),
	CONSTRAINT "ck_assigned_task_priority" CHECK (priority IN ('low', 'normal', 'high', 'urgent'))
);
--> statement-breakpoint
CREATE TABLE "conversation_reads" (
	"conversation_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"last_read_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "conversation_reads_conversation_id_user_id_pk" PRIMARY KEY("conversation_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"kind" text NOT NULL,
	"task_id" uuid,
	"plan_id" uuid,
	"team_id" uuid,
	"dm_key" text,
	"last_message_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_conversation_kind" CHECK (kind IN ('task', 'plan', 'team', 'dm')),
	CONSTRAINT "ck_conversation_target" CHECK (("conversations"."kind" = 'task' AND "conversations"."task_id" IS NOT NULL)
        OR ("conversations"."kind" = 'plan' AND "conversations"."plan_id" IS NOT NULL)
        OR ("conversations"."kind" = 'team' AND "conversations"."team_id" IS NOT NULL)
        OR ("conversations"."kind" = 'dm' AND "conversations"."dm_key" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"author_id" text,
	"body" text NOT NULL,
	"mentions" text[] DEFAULT ARRAY[]::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "org_deletion_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"organization_name" text NOT NULL,
	"requested_by_id" text,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_id" text,
	"decision_note" text,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_deletion_status" CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "org_page_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"page_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"title" text NOT NULL,
	"body_md" text NOT NULL,
	"change_note" text,
	"author_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_org_page_versions_page_version" UNIQUE("page_id","version")
);
--> statement-breakpoint
CREATE TABLE "org_pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"team_id" uuid,
	"parent_id" uuid,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"current_version" integer DEFAULT 1 NOT NULL,
	"created_by_id" text,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "uq_org_pages_org_slug" UNIQUE("organization_id","slug")
);
--> statement-breakpoint
CREATE TABLE "organization_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "uq_org_memberships_org_user" UNIQUE("organization_id","user_id"),
	CONSTRAINT "ck_org_membership_role" CHECK (role IN ('owner', 'admin', 'member'))
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"suspended_at" timestamp with time zone,
	"suspended_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "plan_reviews" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"reviewer_id" text,
	"action" text NOT NULL,
	"comment" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_plan_review_action" CHECK (action IN ('approved', 'changes_requested'))
);
--> statement-breakpoint
CREATE TABLE "plan_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"why" text,
	"estimate_hours" integer,
	"position" integer DEFAULT 0 NOT NULL,
	"is_done" boolean DEFAULT false NOT NULL,
	"done_at" timestamp with time zone,
	"assigned_task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "ck_plan_task_kind" CHECK (kind IN ('main', 'sub_goal', 'gtm')),
	CONSTRAINT "ck_plan_task_estimate_hours" CHECK ("plan_tasks"."estimate_hours" IS NULL OR "plan_tasks"."estimate_hours" BETWEEN 1 AND 60),
	CONSTRAINT "ck_plan_task_why_main_only" CHECK ("plan_tasks"."why" IS NULL OR "plan_tasks"."kind" = 'main')
);
--> statement-breakpoint
CREATE TABLE "reminder_sends" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_reminder_sends" UNIQUE("user_id","kind","ref")
);
--> statement-breakpoint
CREATE TABLE "team_memberships" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"is_lead" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_team_memberships_team_user" UNIQUE("team_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "team_repos" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"team_id" uuid NOT NULL,
	"owner" text NOT NULL,
	"name" text NOT NULL,
	"html_url" text NOT NULL,
	"added_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_team_repos_team_repo" UNIQUE("team_id","owner","name")
);
--> statement-breakpoint
CREATE TABLE "teams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "uq_teams_org_name" UNIQUE("organization_id","name"),
	CONSTRAINT "uq_teams_org_id" UNIQUE("organization_id","id")
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" text PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'UTC' NOT NULL,
	"phone" text,
	"deadline_lead" text DEFAULT '1d' NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "ck_user_settings_deadline_lead" CHECK (deadline_lead IN ('1h', '1d', '3d'))
);
--> statement-breakpoint
CREATE TABLE "user_suspensions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"reason" text NOT NULL,
	"suspended_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lifted_at" timestamp with time zone,
	"lifted_by_id" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"first_name" text DEFAULT '' NOT NULL,
	"last_name" text DEFAULT '' NOT NULL,
	"image_url" text,
	"platform_role" text DEFAULT 'none' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "ck_users_platform_role" CHECK (platform_role IN ('none', 'staff', 'superadmin'))
);
--> statement-breakpoint
CREATE TABLE "weekly_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"user_id" text NOT NULL,
	"week_start" date NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp with time zone,
	"approved_at" timestamp with time zone,
	"approved_by_id" text,
	"completed_at" timestamp with time zone,
	"main_goal_shipped" boolean,
	"outcome_note" text,
	"ai_review" jsonb,
	"ai_reviewed_at" timestamp with time zone,
	"ai_review_plan_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone,
	CONSTRAINT "uq_weekly_plans_org_user_week" UNIQUE("organization_id","user_id","week_start"),
	CONSTRAINT "ck_weekly_plan_status" CHECK (status IN ('draft', 'submitted', 'approved', 'done')),
	CONSTRAINT "ck_weekly_plan_monday" CHECK (EXTRACT(ISODOW FROM "weekly_plans"."week_start") = 1)
);
--> statement-breakpoint
ALTER TABLE "admin_audit_log" ADD CONSTRAINT "admin_audit_log_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_events" ADD CONSTRAINT "ai_usage_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD CONSTRAINT "assigned_tasks_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD CONSTRAINT "assigned_tasks_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD CONSTRAINT "assigned_tasks_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD CONSTRAINT "assigned_tasks_assigned_by_id_users_id_fk" FOREIGN KEY ("assigned_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD CONSTRAINT "assigned_tasks_github_repo_id_team_repos_id_fk" FOREIGN KEY ("github_repo_id") REFERENCES "public"."team_repos"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversation_reads" ADD CONSTRAINT "conversation_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_task_id_assigned_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."assigned_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_plan_id_weekly_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "messages" ADD CONSTRAINT "messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_deletion_requests" ADD CONSTRAINT "org_deletion_requests_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_deletion_requests" ADD CONSTRAINT "org_deletion_requests_decided_by_id_users_id_fk" FOREIGN KEY ("decided_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_page_versions" ADD CONSTRAINT "org_page_versions_page_id_org_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."org_pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_page_versions" ADD CONSTRAINT "org_page_versions_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_pages" ADD CONSTRAINT "org_pages_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_pages" ADD CONSTRAINT "org_pages_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_pages" ADD CONSTRAINT "org_pages_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_pages" ADD CONSTRAINT "fk_org_pages_parent" FOREIGN KEY ("parent_id") REFERENCES "public"."org_pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_memberships" ADD CONSTRAINT "organization_memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_reviews" ADD CONSTRAINT "plan_reviews_plan_id_weekly_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_reviews" ADD CONSTRAINT "plan_reviews_reviewer_id_users_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_tasks" ADD CONSTRAINT "plan_tasks_plan_id_weekly_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."weekly_plans"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_tasks" ADD CONSTRAINT "plan_tasks_assigned_task_id_assigned_tasks_id_fk" FOREIGN KEY ("assigned_task_id") REFERENCES "public"."assigned_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_sends" ADD CONSTRAINT "reminder_sends_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "fk_team_memberships_team" FOREIGN KEY ("organization_id","team_id") REFERENCES "public"."teams"("organization_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_memberships" ADD CONSTRAINT "fk_team_memberships_member" FOREIGN KEY ("organization_id","user_id") REFERENCES "public"."organization_memberships"("organization_id","user_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_repos" ADD CONSTRAINT "team_repos_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_repos" ADD CONSTRAINT "team_repos_team_id_teams_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."teams"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_repos" ADD CONSTRAINT "team_repos_added_by_id_users_id_fk" FOREIGN KEY ("added_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "teams" ADD CONSTRAINT "teams_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_suspensions" ADD CONSTRAINT "user_suspensions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_suspensions" ADD CONSTRAINT "user_suspensions_suspended_by_id_users_id_fk" FOREIGN KEY ("suspended_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_suspensions" ADD CONSTRAINT "user_suspensions_lifted_by_id_users_id_fk" FOREIGN KEY ("lifted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_plans" ADD CONSTRAINT "weekly_plans_approved_by_id_users_id_fk" FOREIGN KEY ("approved_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_admin_audit_created" ON "admin_audit_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ix_ai_usage_org_created" ON "ai_usage_events" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_ai_usage_user_created" ON "ai_usage_events" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "ix_ai_usage_created" ON "ai_usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "ix_assigned_tasks_org_assignee" ON "assigned_tasks" USING btree ("organization_id","assignee_id");--> statement-breakpoint
CREATE INDEX "ix_assigned_tasks_org_assigner" ON "assigned_tasks" USING btree ("organization_id","assigned_by_id");--> statement-breakpoint
CREATE INDEX "ix_assigned_tasks_deadline_open" ON "assigned_tasks" USING btree ("deadline") WHERE "assigned_tasks"."status" IN ('todo', 'in_progress');--> statement-breakpoint
CREATE UNIQUE INDEX "uq_conversations_task" ON "conversations" USING btree ("task_id") WHERE "conversations"."task_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_conversations_plan" ON "conversations" USING btree ("plan_id") WHERE "conversations"."plan_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_conversations_team" ON "conversations" USING btree ("team_id") WHERE "conversations"."team_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_conversations_dm" ON "conversations" USING btree ("organization_id","dm_key") WHERE "conversations"."dm_key" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "ix_messages_conversation_created" ON "messages" USING btree ("conversation_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_deletion_one_pending" ON "org_deletion_requests" USING btree ("organization_id") WHERE "org_deletion_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "ix_org_pages_org" ON "org_pages" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "ix_org_memberships_user" ON "organization_memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ix_plan_reviews_plan" ON "plan_reviews" USING btree ("plan_id");--> statement-breakpoint
CREATE INDEX "ix_plan_tasks_plan" ON "plan_tasks" USING btree ("plan_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_plan_tasks_one_main" ON "plan_tasks" USING btree ("plan_id") WHERE "plan_tasks"."kind" = 'main';--> statement-breakpoint
CREATE UNIQUE INDEX "uq_plan_tasks_assigned_task" ON "plan_tasks" USING btree ("assigned_task_id") WHERE "plan_tasks"."assigned_task_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_team_memberships_one_lead" ON "team_memberships" USING btree ("team_id") WHERE "team_memberships"."is_lead";--> statement-breakpoint
CREATE INDEX "ix_team_memberships_org_user" ON "team_memberships" USING btree ("organization_id","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_user_suspensions_open" ON "user_suspensions" USING btree ("user_id") WHERE "user_suspensions"."lifted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "ix_users_email" ON "users" USING btree (lower("email"));--> statement-breakpoint
CREATE INDEX "ix_weekly_plans_org_week" ON "weekly_plans" USING btree ("organization_id","week_start");