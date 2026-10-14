-- Custom SQL migration file, put your code below! --
-- Issue keys: number every existing task 1, 2, 3… per organization in the order
-- they were created, start each organization's counter after its last number,
-- then make the number required. New tasks take theirs from organizations.task_seq.
WITH numbered AS (
  SELECT "id", row_number() OVER (PARTITION BY "organization_id" ORDER BY "created_at", "id") AS n
  FROM "assigned_tasks"
)
UPDATE "assigned_tasks" t SET "number" = numbered.n FROM numbered WHERE t."id" = numbered."id";--> statement-breakpoint
UPDATE "organizations" o
SET "task_seq" = COALESCE((SELECT MAX("number") FROM "assigned_tasks" t WHERE t."organization_id" = o."id"), 0);--> statement-breakpoint
ALTER TABLE "assigned_tasks" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
-- Same rule as 0001_enable_rls: RLS on with no policies, only the API's own connection reads it.
ALTER TABLE "task_events" ENABLE ROW LEVEL SECURITY;
