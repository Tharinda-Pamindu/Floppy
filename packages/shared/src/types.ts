import type {
  AiOperation,
  AiOutcome,
  AssignedTaskStatus,
  ConversationKind,
  DeadlineLead,
  DeletionRequestStatus,
  IssueType,
  TaskEventField,
  OrgRole,
  PlanStatus,
  PlatformRole,
  Priority,
  ReviewAction,
  TaskKind,
} from "./constants.js";

/** Error body for every non-2xx API response. */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    field?: string;
    fields?: Record<string, string>;
  };
}

export interface Paginated<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  imageUrl?: string | null;
}

export interface MeResponse extends PersonRef {
  platformRole: PlatformRole;
  settings: { timezone: string; phone: string | null; deadlineLead: DeadlineLead };
}

export interface OrganizationSummary {
  id: string;
  name: string;
  role: OrgRole;
  suspended: boolean;
}

export interface OrganizationDetail extends OrganizationSummary {
  suspendedReason: string | null;
  isLead: boolean;
  teamCount: number;
  memberCount: number;
  pendingDeletion: { id: string; reason: string; requestedAt: string } | null;
}

export interface Member extends PersonRef {
  role: OrgRole;
  joinedAt: string;
}

export interface Invite {
  id: string;
  email: string;
  role: "admin" | "member";
  status: string;
  createdAt: string;
  expiresAt: string | null;
  url: string | null;
}

export interface TeamMember extends PersonRef {
  isLead: boolean;
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  members: TeamMember[];
  lead: TeamMember | null;
  repoCount: number;
}

export interface PlanTask {
  id: string;
  kind: TaskKind;
  title: string;
  why: string | null;
  estimateHours: number | null;
  position: number;
  isDone: boolean;
  doneAt: string | null;
  assignedTaskId: string | null;
}

export interface PlanReviewEntry {
  id: string;
  action: ReviewAction;
  comment: string | null;
  reviewer: PersonRef | null;
  createdAt: string;
}

export type AiIssue =
  | "not_checkable"
  | "missing_why"
  | "missing_gtm"
  | "scope_too_big"
  | "carried_over"
  | "unclear";

export interface AiFinding {
  taskId: string | null;
  taskKind: TaskKind;
  issue: AiIssue;
  severity: "must_fix" | "consider";
  problem: string;
  field: "title" | "why";
  suggestedRewrite: string;
}

export interface AiReview {
  verdict: "approve" | "adjust";
  summary: string;
  findings: AiFinding[];
  reviewedAt: string;
  isStale: boolean;
}

export interface PlanPermissions {
  edit: boolean;
  submit: boolean;
  withdraw: boolean;
  review: boolean;
  tickTasks: boolean;
  complete: boolean;
  aiReview: boolean;
}

export interface Plan {
  id: string;
  organizationId: string;
  author: PersonRef;
  weekStart: string;
  status: PlanStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: PersonRef | null;
  completedAt: string | null;
  mainGoalShipped: boolean | null;
  outcomeNote: string | null;
  tasks: PlanTask[];
  reviews: PlanReviewEntry[];
  aiReview: AiReview | null;
  permissions: PlanPermissions;
  createdAt: string;
  updatedAt: string | null;
}

export interface TeamWeekRow {
  member: TeamMember;
  plan: {
    id: string;
    status: PlanStatus;
    readable: boolean;
    mainTaskTitle: string | null;
    tasksDone: number;
    tasksTotal: number;
    mainGoalShipped: boolean | null;
  } | null;
}

export interface WeekRollup {
  weekStart: string;
  memberCount: number;
  submitted: number;
  approved: number;
  closed: number;
  shipped: number;
}

export interface AiDraft {
  mainTask: { title: string; why: string; estimateHours: number | null };
  subGoals: { title: string; estimateHours: number | null }[];
  gtmGoals: { title: string; estimateHours: number | null }[];
  leftOut: string[];
}

export interface GithubIssueRef {
  repoId: string;
  repoFullName: string;
  number: number;
  url: string;
  state: "open" | "closed" | null;
  title: string | null;
}

export interface AssignedTask {
  id: string;
  organizationId: string;
  teamId: string | null;
  teamName: string | null;
  title: string;
  description: string | null;
  assignee: PersonRef;
  assignedBy: PersonRef;
  deadline: string;
  priority: Priority;
  status: AssignedTaskStatus;
  /** Per-organization number; `key` is the display form, e.g. FLOP-42. */
  number: number;
  key: string;
  type: IssueType;
  storyPoints: number | null;
  labels: string[];
  completedAt: string | null;
  github: GithubIssueRef | null;
  planLink: { planId: string; planTaskId: string; weekStart: string } | null;
  conversationId: string | null;
  createdAt: string;
  permissions: { edit: boolean; changeStatus: boolean; pull: boolean };
}

/** One change in a task's history. Values are display-ready text (names, ISO dates, labels joined by ", "). */
export interface TaskEvent {
  id: string;
  field: TaskEventField;
  from: string | null;
  to: string | null;
  actor: PersonRef | null;
  createdAt: string;
}

export interface TeamRepo {
  id: string;
  teamId: string;
  owner: string;
  name: string;
  fullName: string;
  htmlUrl: string;
  addedBy: PersonRef | null;
  createdAt: string;
}

export interface GithubIssue {
  number: number;
  title: string;
  state: "open" | "closed";
  url: string;
  labels: string[];
  author: string | null;
  createdAt: string;
  assignedTaskId: string | null;
}

export interface Conversation {
  id: string;
  kind: ConversationKind;
  title: string;
  teamId: string | null;
  taskId: string | null;
  planId: string | null;
  participants: PersonRef[];
  unread: number;
  lastMessageAt: string | null;
}

export interface Message {
  id: string;
  conversationId: string;
  author: PersonRef | null;
  body: string;
  mentions: string[];
  createdAt: string;
  editedAt: string | null;
  deleted: boolean;
}

export interface PageSummary {
  id: string;
  title: string;
  slug: string;
  teamId: string | null;
  teamName: string | null;
  parentId: string | null;
  currentVersion: number;
  updatedAt: string;
  updatedBy: PersonRef | null;
  canEdit: boolean;
}

export interface PageDetail extends PageSummary {
  bodyMd: string;
  version: number;
  changeNote: string | null;
  children: PageSummary[];
}

export interface PageVersionSummary {
  version: number;
  title: string;
  changeNote: string | null;
  author: PersonRef | null;
  createdAt: string;
  bytes: number;
}

export interface NotificationPreferences {
  global: { email: boolean; sms: boolean; inApp: boolean };
  workflows: {
    workflowId: string;
    name: string;
    critical: boolean;
    channels: { email?: boolean; sms?: boolean; inApp?: boolean };
  }[];
}

export interface InboxSession {
  applicationIdentifier: string;
  subscriberId: string;
  subscriberHash: string | null;
}

// -- Staff ------------------------------------------------------------------

export interface StaffOrganization {
  id: string;
  name: string;
  suspendedAt: string | null;
  suspendedReason: string | null;
  memberCount: number;
  teamCount: number;
  planCount: number;
  taskCount: number;
  messageCount: number;
  pageCount: number;
  lastActiveAt: string;
  createdAt: string;
}

export interface StaffUser extends PersonRef {
  platformRole: PlatformRole;
  isActive: boolean;
  createdAt: string;
  isOwner: boolean;
}

export interface StaffUserDetail extends StaffUser {
  memberships: {
    organizationId: string;
    organizationName: string;
    role: OrgRole;
    organizationSuspended: boolean;
    joinedAt: string;
  }[];
}

export interface AiUsageByOrg {
  organizationId: string;
  organizationName: string;
  calls: number;
  succeeded: number;
  failed: number;
  rateLimited: number;
  inputTokens: number;
  outputTokens: number;
  lastCallAt: string | null;
}

export interface AiUsageEvent {
  id: string;
  organizationId: string;
  organizationName: string;
  operation: AiOperation;
  outcome: AiOutcome;
  errorKind: string | null;
  model: string;
  latencyMs: number;
  createdAt: string;
}

export interface DeletionRequest {
  id: string;
  organizationId: string;
  organizationName: string;
  requestedBy: PersonRef | null;
  reason: string;
  status: DeletionRequestStatus;
  decidedBy: PersonRef | null;
  decisionNote: string | null;
  createdAt: string;
  decidedAt: string | null;
  counts: { members: number; teams: number; plans: number; tasks: number; pages: number };
}

export interface OwnerRow extends PersonRef {
  isActive: boolean;
  suspension: { reason: string; at: string } | null;
  organizations: { id: string; name: string }[];
}

export interface AuditEntry {
  id: string;
  actor: PersonRef | null;
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  createdAt: string;
}
