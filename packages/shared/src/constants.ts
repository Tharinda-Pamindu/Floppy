/** Brand strings. The name, tagline and pitch are Floppy's own. */
export const BRAND = {
  name: "Floppy",
  tagline: "Less strain. More brain.",
  pitch:
    "Floppy gets every engineer on your team to commit to one thing they'll ship this week, reviewed before you approve it, so by Friday you know what actually shipped.",
} as const;

/** Customer roles inside one organization. Not to be confused with platform roles. */
export const ORG_ROLES = ["owner", "admin", "member"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];
/** Roles that manage members, teams, invites and settings. */
export const MANAGER_ROLES: readonly OrgRole[] = ["owner", "admin"];
/** Roles an invite can grant. Ownership is only ever given by an owner, directly. */
export const INVITABLE_ROLES = ["admin", "member"] as const;
export type InvitableRole = (typeof INVITABLE_ROLES)[number];

/** Platform roles: who may use the staff console. Unrelated to OrgRole "admin". */
export const PLATFORM_ROLES = ["none", "staff", "superadmin"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

export const PLAN_STATUSES = ["draft", "submitted", "approved", "done"] as const;
export type PlanStatus = (typeof PLAN_STATUSES)[number];

export const TASK_KINDS = ["main", "sub_goal", "gtm"] as const;
export type TaskKind = (typeof TASK_KINDS)[number];

export const REVIEW_ACTIONS = ["approved", "changes_requested"] as const;
export type ReviewAction = (typeof REVIEW_ACTIONS)[number];

export const ASSIGNED_TASK_STATUSES = ["todo", "in_progress", "in_review", "done", "cancelled"] as const;
export type AssignedTaskStatus = (typeof ASSIGNED_TASK_STATUSES)[number];
/** Statuses that still need work: reminders, the plan picker and "open" counts use these. */
export const OPEN_TASK_STATUSES = ["todo", "in_progress", "in_review"] as const satisfies readonly AssignedTaskStatus[];
export function isOpenTaskStatus(status: AssignedTaskStatus) {
  return (OPEN_TASK_STATUSES as readonly AssignedTaskStatus[]).includes(status);
}
/** The board's columns, left to right (cancelled tasks stay off the board). */
export const BOARD_STATUSES = ["todo", "in_progress", "in_review", "done"] as const satisfies readonly AssignedTaskStatus[];

/** Jira-style issue types. */
export const ISSUE_TYPES = ["task", "bug", "story"] as const;
export type IssueType = (typeof ISSUE_TYPES)[number];
/** Suggested story points (any whole number from 1 to LIMITS.storyPointsMax is allowed). */
export const STORY_POINT_SCALE = [1, 2, 3, 5, 8, 13, 21] as const;

/** Fields a task's history records. */
export const TASK_EVENT_FIELDS = [
  "created",
  "title",
  "description",
  "assignee",
  "deadline",
  "priority",
  "status",
  "type",
  "story_points",
  "labels",
] as const;
export type TaskEventField = (typeof TASK_EVENT_FIELDS)[number];

export const PRIORITIES = ["low", "normal", "high", "urgent"] as const;
export type Priority = (typeof PRIORITIES)[number];

export const DEADLINE_LEADS = ["1h", "1d", "3d"] as const;
export type DeadlineLead = (typeof DEADLINE_LEADS)[number];
export const DEADLINE_LEAD_MS: Record<DeadlineLead, number> = {
  "1h": 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
  "3d": 3 * 24 * 60 * 60 * 1000,
};

export const CONVERSATION_KINDS = ["task", "plan", "team", "dm"] as const;
export type ConversationKind = (typeof CONVERSATION_KINDS)[number];

export const AI_OPERATIONS = ["plan_review", "plan_draft"] as const;
export type AiOperation = (typeof AI_OPERATIONS)[number];
export const AI_OUTCOMES = ["succeeded", "failed", "rate_limited"] as const;
export type AiOutcome = (typeof AI_OUTCOMES)[number];

export const DELETION_REQUEST_STATUSES = ["pending", "approved", "rejected", "cancelled"] as const;
export type DeletionRequestStatus = (typeof DELETION_REQUEST_STATUSES)[number];

export const LIMITS = {
  nameMax: 100,
  orgNameMax: 100,
  teamNameMax: 100,
  teamDescriptionMax: 500,
  taskTitleMax: 300,
  taskWhyMax: 1000,
  estimateMin: 1,
  estimateMax: 60,
  maxPlanTasks: 15,
  reviewCommentMax: 2000,
  outcomeNoteMax: 1000,
  brainDumpMin: 10,
  brainDumpMax: 4000,
  suspendReasonMax: 500,
  assignedDescriptionMax: 4000,
  messageMax: 4000,
  pageTitleMax: 200,
  pageBodyMaxBytes: 200 * 1024,
  pageChangeNoteMax: 300,
  deletionReasonMax: 1000,
  /** A focused week holds about this many hours; above it the UI warns. */
  capacityHours: 30,
  inviteExpireDays: 14,
  aiCallsPerMinute: 6,
  messagesPerMinute: 30,
  storyPointsMax: 100,
  labelMax: 24,
  maxLabels: 5,
  taskSearchMax: 100,
  /** Most tasks one list, board or calendar request returns. */
  taskListMax: 300,
  /** Widest date range one calendar request may ask for (six weeks plus slack). */
  calendarRangeMaxDays: 62,
} as const;

/**
 * The prefix of an organization's issue keys (FLOP in FLOP-42), from its name:
 * the initials of a multi-word name ("Harbor Health" → HH), otherwise the
 * first four letters ("Northwind" → NORT). Display only; numbers are what's stored.
 */
export function issueKeyPrefix(orgName: string) {
  const words = orgName.toUpperCase().match(/[A-Z0-9]+/g) ?? [];
  const prefix = words.length > 1 ? words.map((w) => w[0]).join("").slice(0, 4) : (words[0] ?? "").slice(0, 4);
  return prefix || "TASK";
}
export function issueKey(orgName: string, number: number) {
  return `${issueKeyPrefix(orgName)}-${number}`;
}

export const DEFAULT_FIRST_TEAM_NAME = "Core team";
