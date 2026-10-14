/**
 * Supabase Postgres schema (Drizzle).
 *
 * Users and organizations are keyed by their Clerk ids (text). Everything else
 * uses UUIDs. String columns + CHECK constraints stand in for enums.
 * Row Level Security is enabled on every table with no policies (see the
 * custom migration), so Supabase's anon/authenticated keys can read nothing;
 * only the API's own connection touches the data.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const ts = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });
const createdAt = () => ts("created_at").notNull().defaultNow();
const updatedAt = () => ts("updated_at");
const inList = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((v) => `'${v}'`).join(", ")})`);

// -- Identity mirror (source of truth: Clerk) ---------------------------------

export const users = pgTable(
  "users",
  {
    id: text("id").primaryKey(), // Clerk user id
    email: text("email").notNull(),
    firstName: text("first_name").notNull().default(""),
    lastName: text("last_name").notNull().default(""),
    imageUrl: text("image_url"),
    /** Platform role: staff console access. Unrelated to the org role "admin". */
    platformRole: text("platform_role").notNull().default("none"),
    /** False when the account is banned in Clerk (deactivated or suspended). */
    isActive: boolean("is_active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("ck_users_platform_role", inList("platform_role", ["none", "staff", "superadmin"])),
    index("ix_users_email").on(sql`lower(${t.email})`),
  ],
);

export const userSettings = pgTable(
  "user_settings",
  {
    userId: text("user_id")
      .primaryKey()
      .references(() => users.id, { onDelete: "cascade" }),
    timezone: text("timezone").notNull().default("UTC"),
    phone: text("phone"),
    deadlineLead: text("deadline_lead").notNull().default("1d"),
    updatedAt: updatedAt(),
  },
  () => [check("ck_user_settings_deadline_lead", inList("deadline_lead", ["1h", "1d", "3d"]))],
);

export const userSuspensions = pgTable(
  "user_suspensions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reason: text("reason").notNull(),
    suspendedById: text("suspended_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    liftedAt: ts("lifted_at"),
    liftedById: text("lifted_by_id").references(() => users.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("uq_user_suspensions_open").on(t.userId).where(sql`${t.liftedAt} IS NULL`),
  ],
);

export const organizations = pgTable("organizations", {
  id: text("id").primaryKey(), // Clerk organization id
  name: text("name").notNull(),
  /** Set by platform staff; a suspended org's members are locked out of it. */
  suspendedAt: ts("suspended_at"),
  suspendedReason: text("suspended_reason"),
  /** The last issue number handed out; tasks get keys like FLOP-42 from it. */
  taskSeq: integer("task_seq").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const organizationMemberships = pgTable(
  "organization_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_org_memberships_org_user").on(t.organizationId, t.userId),
    index("ix_org_memberships_user").on(t.userId),
    check("ck_org_membership_role", inList("role", ["owner", "admin", "member"])),
  ],
);

// -- Teams ----------------------------------------------------------------------

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_teams_org_name").on(t.organizationId, t.name),
    // Target of the composite foreign key on team_memberships.
    unique("uq_teams_org_id").on(t.organizationId, t.id),
  ],
);

export const teamMemberships = pgTable(
  "team_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id").notNull(),
    teamId: uuid("team_id").notNull(),
    userId: text("user_id").notNull(),
    isLead: boolean("is_lead").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [
    unique("uq_team_memberships_team_user").on(t.teamId, t.userId),
    // Both sides belong to the same organization, so nobody can be put in
    // another org's team, and leaving the org removes their team rows.
    foreignKey({
      name: "fk_team_memberships_team",
      columns: [t.organizationId, t.teamId],
      foreignColumns: [teams.organizationId, teams.id],
    }).onDelete("cascade"),
    foreignKey({
      name: "fk_team_memberships_member",
      columns: [t.organizationId, t.userId],
      foreignColumns: [organizationMemberships.organizationId, organizationMemberships.userId],
    }).onDelete("cascade"),
    // At most one lead per team.
    uniqueIndex("uq_team_memberships_one_lead").on(t.teamId).where(sql`${t.isLead}`),
    index("ix_team_memberships_org_user").on(t.organizationId, t.userId),
  ],
);

export const teamRepos = pgTable(
  "team_repos",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    owner: text("owner").notNull(),
    name: text("name").notNull(),
    htmlUrl: text("html_url").notNull(),
    addedById: text("added_by_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [unique("uq_team_repos_team_repo").on(t.teamId, t.owner, t.name)],
);

// -- Weekly plans -----------------------------------------------------------------

export const weeklyPlans = pgTable(
  "weekly_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Plans belong to the person, not a team, so history survives team changes.
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    weekStart: date("week_start", { mode: "string" }).notNull(),
    status: text("status").notNull().default("draft"),
    submittedAt: ts("submitted_at"),
    approvedAt: ts("approved_at"),
    approvedById: text("approved_by_id").references(() => users.id, { onDelete: "set null" }),
    completedAt: ts("completed_at"),
    mainGoalShipped: boolean("main_goal_shipped"),
    outcomeNote: text("outcome_note"),
    /** Latest AI review, already mapped to task ids. */
    aiReview: jsonb("ai_review"),
    aiReviewedAt: ts("ai_reviewed_at"),
    /** Fingerprint of the content the review saw, to mark it stale after edits. */
    aiReviewPlanHash: text("ai_review_plan_hash"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_weekly_plans_org_user_week").on(t.organizationId, t.userId, t.weekStart),
    index("ix_weekly_plans_org_week").on(t.organizationId, t.weekStart),
    check("ck_weekly_plan_status", inList("status", ["draft", "submitted", "approved", "done"])),
    check("ck_weekly_plan_monday", sql`EXTRACT(ISODOW FROM ${t.weekStart}) = 1`),
  ],
);

export const assignedTasks = pgTable(
  "assigned_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    description: text("description"),
    assigneeId: text("assignee_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    assignedById: text("assigned_by_id").references(() => users.id, { onDelete: "set null" }),
    deadline: ts("deadline").notNull(),
    priority: text("priority").notNull().default("normal"),
    status: text("status").notNull().default("todo"),
    /** Per-organization issue number (the 42 in FLOP-42), from organizations.task_seq. */
    number: integer("number").notNull(),
    type: text("type").notNull().default("task"),
    storyPoints: integer("story_points"),
    labels: text("labels").array().notNull().default(sql`'{}'::text[]`),
    completedAt: ts("completed_at"),
    githubRepoId: uuid("github_repo_id").references(() => teamRepos.id, { onDelete: "set null" }),
    githubIssueNumber: integer("github_issue_number"),
    githubIssueUrl: text("github_issue_url"),
    githubIssueTitle: text("github_issue_title"),
    githubIssueState: text("github_issue_state"),
    githubSyncedAt: ts("github_synced_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    check("ck_assigned_task_status", inList("status", ["todo", "in_progress", "in_review", "done", "cancelled"])),
    check("ck_assigned_task_priority", inList("priority", ["low", "normal", "high", "urgent"])),
    check("ck_assigned_task_type", inList("type", ["task", "bug", "story"])),
    check("ck_assigned_task_story_points", sql`${t.storyPoints} IS NULL OR ${t.storyPoints} BETWEEN 1 AND 100`),
    uniqueIndex("uq_assigned_tasks_org_number").on(t.organizationId, t.number),
    index("ix_assigned_tasks_labels").using("gin", t.labels),
    index("ix_assigned_tasks_org_assignee").on(t.organizationId, t.assigneeId),
    index("ix_assigned_tasks_org_assigner").on(t.organizationId, t.assignedById),
    index("ix_assigned_tasks_deadline_open")
      .on(t.deadline)
      .where(sql`${t.status} IN ('todo', 'in_progress', 'in_review')`),
  ],
);

/** A task's history: who changed what, from what, to what (Jira's History tab). */
export const taskEvents = pgTable(
  "task_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    taskId: uuid("task_id")
      .notNull()
      .references(() => assignedTasks.id, { onDelete: "cascade" }),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    field: text("field").notNull(),
    fromValue: text("from_value"),
    toValue: text("to_value"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ix_task_events_task").on(t.taskId, t.createdAt),
    check(
      "ck_task_event_field",
      inList("field", ["created", "title", "description", "assignee", "deadline", "priority", "status", "type", "story_points", "labels"]),
    ),
  ],
);

export const planTasks = pgTable(
  "plan_tasks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => weeklyPlans.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    /** Why the main task matters; only the main task has one. */
    why: text("why"),
    estimateHours: integer("estimate_hours"),
    position: integer("position").notNull().default(0),
    isDone: boolean("is_done").notNull().default(false),
    doneAt: ts("done_at"),
    /** Set when an assigned task was pulled into this plan. */
    assignedTaskId: uuid("assigned_task_id").references(() => assignedTasks.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("ix_plan_tasks_plan").on(t.planId),
    check("ck_plan_task_kind", inList("kind", ["main", "sub_goal", "gtm"])),
    check("ck_plan_task_estimate_hours", sql`${t.estimateHours} IS NULL OR ${t.estimateHours} BETWEEN 1 AND 60`),
    check("ck_plan_task_why_main_only", sql`${t.why} IS NULL OR ${t.kind} = 'main'`),
    // Exactly one main task is enforced at submit; the DB never allows two.
    uniqueIndex("uq_plan_tasks_one_main").on(t.planId).where(sql`${t.kind} = 'main'`),
    uniqueIndex("uq_plan_tasks_assigned_task").on(t.assignedTaskId).where(sql`${t.assignedTaskId} IS NOT NULL`),
  ],
);

export const planReviews = pgTable(
  "plan_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => weeklyPlans.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    comment: text("comment"),
    createdAt: createdAt(),
  },
  (t) => [
    index("ix_plan_reviews_plan").on(t.planId),
    check("ck_plan_review_action", inList("action", ["approved", "changes_requested"])),
  ],
);

export const aiUsageEvents = pgTable(
  "ai_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    operation: text("operation").notNull(),
    outcome: text("outcome").notNull(),
    /** Short machine-readable failure reason, e.g. "timeout". Never prompt text. */
    errorKind: text("error_kind"),
    model: text("model").notNull(),
    latencyMs: integer("latency_ms").notNull().default(0),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    createdAt: createdAt(),
  },
  (t) => [
    check("ck_ai_usage_op", inList("operation", ["plan_review", "plan_draft"])),
    check("ck_ai_usage_outcome", inList("outcome", ["succeeded", "failed", "rate_limited"])),
    index("ix_ai_usage_org_created").on(t.organizationId, t.createdAt),
    index("ix_ai_usage_user_created").on(t.userId, t.createdAt),
    index("ix_ai_usage_created").on(t.createdAt),
  ],
);

// -- Chat ---------------------------------------------------------------------------

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    taskId: uuid("task_id").references(() => assignedTasks.id, { onDelete: "cascade" }),
    planId: uuid("plan_id").references(() => weeklyPlans.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
    /** For DMs: the two user ids, sorted and joined with "|". */
    dmKey: text("dm_key"),
    lastMessageAt: ts("last_message_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("ck_conversation_kind", inList("kind", ["task", "plan", "team", "dm"])),
    check(
      "ck_conversation_target",
      sql`(${t.kind} = 'task' AND ${t.taskId} IS NOT NULL)
        OR (${t.kind} = 'plan' AND ${t.planId} IS NOT NULL)
        OR (${t.kind} = 'team' AND ${t.teamId} IS NOT NULL)
        OR (${t.kind} = 'dm' AND ${t.dmKey} IS NOT NULL)`,
    ),
    uniqueIndex("uq_conversations_task").on(t.taskId).where(sql`${t.taskId} IS NOT NULL`),
    uniqueIndex("uq_conversations_plan").on(t.planId).where(sql`${t.planId} IS NOT NULL`),
    uniqueIndex("uq_conversations_team").on(t.teamId).where(sql`${t.teamId} IS NOT NULL`),
    uniqueIndex("uq_conversations_dm").on(t.organizationId, t.dmKey).where(sql`${t.dmKey} IS NOT NULL`),
  ],
);

export const conversationReads = pgTable(
  "conversation_reads",
  {
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    lastReadAt: ts("last_read_at").notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] })],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    mentions: text("mentions").array().notNull().default(sql`ARRAY[]::text[]`),
    createdAt: createdAt(),
    editedAt: ts("edited_at"),
    deletedAt: ts("deleted_at"),
  },
  (t) => [index("ix_messages_conversation_created").on(t.conversationId, t.createdAt)],
);

// -- Pages (markdown wiki, append-only versions) --------------------------------------

export const orgPages = pgTable(
  "org_pages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    teamId: uuid("team_id").references(() => teams.id, { onDelete: "set null" }),
    parentId: uuid("parent_id"),
    title: text("title").notNull(),
    slug: text("slug").notNull(),
    currentVersion: integer("current_version").notNull().default(1),
    createdById: text("created_by_id").references(() => users.id, { onDelete: "set null" }),
    archivedAt: ts("archived_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    unique("uq_org_pages_org_slug").on(t.organizationId, t.slug),
    foreignKey({ name: "fk_org_pages_parent", columns: [t.parentId], foreignColumns: [t.id] }).onDelete("set null"),
    index("ix_org_pages_org").on(t.organizationId),
  ],
);

export const orgPageVersions = pgTable(
  "org_page_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    pageId: uuid("page_id")
      .notNull()
      .references(() => orgPages.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    title: text("title").notNull(),
    bodyMd: text("body_md").notNull(),
    changeNote: text("change_note"),
    authorId: text("author_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [unique("uq_org_page_versions_page_version").on(t.pageId, t.version)],
);

// -- Notifications bookkeeping ------------------------------------------------------

/** One row per reminder actually sent, so cron runs are idempotent. */
export const reminderSends = pgTable(
  "reminder_sends",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(),
    ref: text("ref").notNull(),
    createdAt: createdAt(),
  },
  (t) => [unique("uq_reminder_sends").on(t.userId, t.kind, t.ref)],
);

// -- Super admin ---------------------------------------------------------------------

export const orgDeletionRequests = pgTable(
  "org_deletion_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // No foreign key: the request outlives the organization it deleted.
    organizationId: text("organization_id").notNull(),
    organizationName: text("organization_name").notNull(),
    requestedById: text("requested_by_id").references(() => users.id, { onDelete: "set null" }),
    reason: text("reason").notNull(),
    status: text("status").notNull().default("pending"),
    decidedById: text("decided_by_id").references(() => users.id, { onDelete: "set null" }),
    decisionNote: text("decision_note"),
    decidedAt: ts("decided_at"),
    createdAt: createdAt(),
  },
  (t) => [
    check("ck_deletion_status", inList("status", ["pending", "approved", "rejected", "cancelled"])),
    uniqueIndex("uq_deletion_one_pending").on(t.organizationId).where(sql`${t.status} = 'pending'`),
  ],
);

export const adminAuditLog = pgTable(
  "admin_audit_log",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    actorId: text("actor_id").references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata"),
    createdAt: createdAt(),
  },
  (t) => [index("ix_admin_audit_created").on(t.createdAt)],
);
