CREATE TABLE "task_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"organization_id" text NOT NULL,
	"task_id" uuid NOT NULL,
	"actor_id" text,
	"field" text NOT NULL,
	"from_value" text,
	"to_value" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_task_event_field" CHECK (field IN ('created', 'title', 'description', 'assignee', 'deadline', 'priority', 'status', 'type', 'story_points', 'labels'))
);
--> statement-breakpoint
ALTER TABLE "assigned_tasks" DROP CONSTRAINT "ck_assigned_task_status";--> statement-breakpoint
DROP INDEX "ix_assigned_tasks_deadline_open";--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD COLUMN "type" text DEFAULT 'task' NOT NULL;--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD COLUMN "story_points" integer;--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD COLUMN "labels" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "organizations" ADD COLUMN "task_seq" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_task_id_assigned_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."assigned_tasks"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_events" ADD CONSTRAINT "task_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "ix_task_events_task" ON "task_events" USING btree ("task_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_assigned_tasks_org_number" ON "assigned_tasks" USING btree ("organization_id","number");--> statement-breakpoint
CREATE INDEX "ix_assigned_tasks_labels" ON "assigned_tasks" USING gin ("labels");--> statement-breakpoint
CREATE INDEX "ix_assigned_tasks_deadline_open" ON "assigned_tasks" USING btree ("deadline") WHERE "assigned_tasks"."status" IN ('todo', 'in_progress', 'in_review');--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD CONSTRAINT "ck_assigned_task_type" CHECK (type IN ('task', 'bug', 'story'));--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD CONSTRAINT "ck_assigned_task_story_points" CHECK ("assigned_tasks"."story_points" IS NULL OR "assigned_tasks"."story_points" BETWEEN 1 AND 100);--> statement-breakpoint
ALTER TABLE "assigned_tasks" ADD CONSTRAINT "ck_assigned_task_status" CHECK (status IN ('todo', 'in_progress', 'in_review', 'done', 'cancelled'));