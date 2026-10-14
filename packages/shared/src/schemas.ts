import { z } from "zod";
import {
  ASSIGNED_TASK_STATUSES,
  DEADLINE_LEADS,
  INVITABLE_ROLES,
  ISSUE_TYPES,
  LIMITS,
  ORG_ROLES,
  PRIORITIES,
  TASK_KINDS,
} from "./constants.js";
import { isMonday, isValidTimeZone } from "./week.js";

const trimmed = (max: number) => z.string().trim().min(1, "Required").max(max);
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional();

export const idParam = z.string().trim().min(1).max(64);
export const uuid = z.uuid();
export const mondayDate = z.string().refine(isMonday, "A plan's week starts on a Monday.");

// -- Organizations ----------------------------------------------------------

export const createOrganizationSchema = z.object({
  name: trimmed(LIMITS.orgNameMax),
  firstTeamName: trimmed(LIMITS.teamNameMax).optional(),
});
export const renameOrganizationSchema = z.object({ name: trimmed(LIMITS.orgNameMax) });
export const changeRoleSchema = z.object({ role: z.enum(ORG_ROLES) });
export const createInviteSchema = z.object({
  email: z.email().trim().toLowerCase().max(254),
  role: z.enum(INVITABLE_ROLES),
});
export const deletionRequestSchema = z.object({ reason: trimmed(LIMITS.deletionReasonMax) });

// -- Teams ------------------------------------------------------------------

export const createTeamSchema = z.object({
  name: trimmed(LIMITS.teamNameMax),
  description: optionalText(LIMITS.teamDescriptionMax),
});
export const updateTeamSchema = z
  .object({
    name: trimmed(LIMITS.teamNameMax).optional(),
    description: optionalText(LIMITS.teamDescriptionMax),
  })
  .refine((v) => v.name !== undefined || v.description !== undefined, "Nothing to change.");
export const setTeamMemberSchema = z.object({ isLead: z.boolean().default(false) });
export const linkRepoSchema = z.object({
  repo: z
    .string()
    .trim()
    .transform((v) => v.replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").replace(/\/$/, ""))
    .pipe(z.string().regex(/^[A-Za-z0-9-]{1,39}\/[A-Za-z0-9._-]{1,100}$/, "Use the form owner/repo.")),
});

// -- Plans ------------------------------------------------------------------

export const taskInputSchema = z
  .object({
    id: uuid.optional(),
    kind: z.enum(TASK_KINDS),
    title: trimmed(LIMITS.taskTitleMax),
    why: optionalText(LIMITS.taskWhyMax),
    estimateHours: z.number().int().min(LIMITS.estimateMin).max(LIMITS.estimateMax).nullable().optional(),
    assignedTaskId: uuid.nullable().optional(),
  })
  .refine((t) => t.kind === "main" || !t.why, { message: "Only the main task has a 'why'.", path: ["why"] });
export type TaskInput = z.infer<typeof taskInputSchema>;

const tasksSchema = z
  .array(taskInputSchema)
  .max(LIMITS.maxPlanTasks, `A weekly plan has at most ${LIMITS.maxPlanTasks} tasks. Keep it focused.`)
  .refine((tasks) => tasks.filter((t) => t.kind === "main").length <= 1, "A plan has exactly one main task.");

export const createPlanSchema = z.object({ weekStart: mondayDate, tasks: tasksSchema.default([]) });
export const updatePlanSchema = z.object({ tasks: tasksSchema });
export const tickTaskSchema = z.object({ isDone: z.boolean() });
export const approveSchema = z.object({ comment: optionalText(LIMITS.reviewCommentMax) });
export const requestChangesSchema = z.object({ comment: trimmed(LIMITS.reviewCommentMax) });
export const completePlanSchema = z.object({
  mainGoalShipped: z.boolean(),
  outcomeNote: optionalText(LIMITS.outcomeNoteMax),
});
export const listPlansQuery = z.object({
  weekStart: mondayDate.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});
export const brainDumpSchema = z.object({
  notes: z.string().trim().min(LIMITS.brainDumpMin).max(LIMITS.brainDumpMax),
});

// -- Assigned tasks -----------------------------------------------------------

/** A label is stored lower-case with dashes for spaces: "Front End" → "front-end". */
const label = z
  .string()
  .trim()
  .toLowerCase()
  .transform((v) => v.replace(/\s+/g, "-"))
  .pipe(
    z
      .string()
      .min(1, "Required")
      .max(LIMITS.labelMax)
      .regex(/^[a-z0-9][a-z0-9_-]*$/, "Labels use letters, numbers, dashes and underscores."),
  );
const labels = z
  .array(label)
  .max(LIMITS.maxLabels, `A task has at most ${LIMITS.maxLabels} labels.`)
  .transform((all) => [...new Set(all)]);
const storyPoints = z.number().int().min(1).max(LIMITS.storyPointsMax).nullable();

export const createAssignedTaskSchema = z.object({
  title: trimmed(LIMITS.taskTitleMax),
  description: optionalText(LIMITS.assignedDescriptionMax),
  assigneeId: idParam,
  teamId: uuid.nullable().optional(),
  deadline: z.iso.datetime({ offset: true }),
  priority: z.enum(PRIORITIES).default("normal"),
  type: z.enum(ISSUE_TYPES).default("task"),
  storyPoints: storyPoints.optional(),
  labels: labels.default([]),
  githubRepoId: uuid.nullable().optional(),
  githubIssueNumber: z.number().int().positive().nullable().optional(),
});
export const updateAssignedTaskSchema = z
  .object({
    title: trimmed(LIMITS.taskTitleMax).optional(),
    description: optionalText(LIMITS.assignedDescriptionMax),
    assigneeId: idParam.optional(),
    deadline: z.iso.datetime({ offset: true }).optional(),
    priority: z.enum(PRIORITIES).optional(),
    status: z.enum(ASSIGNED_TASK_STATUSES).optional(),
    type: z.enum(ISSUE_TYPES).optional(),
    storyPoints: storyPoints.optional(),
    labels: labels.optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change.");
export const listAssignedTasksQuery = z
  .object({
    scope: z.enum(["mine", "assigned_by_me", "team"]).default("mine"),
    teamId: uuid.optional(),
    status: z.enum(ASSIGNED_TASK_STATUSES).optional(),
    /** Matches the title, or the key ("FLOP-42" or "42"). */
    q: z.string().trim().max(LIMITS.taskSearchMax).optional(),
    assigneeId: idParam.optional(),
    type: z.enum(ISSUE_TYPES).optional(),
    priority: z.enum(PRIORITIES).optional(),
    label: label.optional(),
    /** Deadline window for the calendar: from (inclusive) to (exclusive). */
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
  })
  .refine((v) => (v.from === undefined) === (v.to === undefined), { message: "Give both from and to.", path: ["to"] })
  .refine((v) => !v.from || !v.to || new Date(v.from) < new Date(v.to), { message: "from must be before to.", path: ["to"] })
  .refine(
    (v) => !v.from || !v.to || new Date(v.to).getTime() - new Date(v.from).getTime() <= LIMITS.calendarRangeMaxDays * 86_400_000,
    { message: `The range can be at most ${LIMITS.calendarRangeMaxDays} days.`, path: ["to"] },
  );
export type ListAssignedTasksQuery = z.infer<typeof listAssignedTasksQuery>;
export const pullIntoPlanSchema = z.object({
  weekStart: mondayDate,
  kind: z.enum(["main", "sub_goal"]).default("sub_goal"),
});

// -- Chat -------------------------------------------------------------------

export const postMessageSchema = z.object({ body: trimmed(LIMITS.messageMax) });
export const listMessagesQuery = z.object({
  before: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export const openDmSchema = z.object({ userId: idParam });

// -- Pages ------------------------------------------------------------------

const pageBody = z
  .string()
  .refine((v) => new TextEncoder().encode(v).length <= LIMITS.pageBodyMaxBytes, "A page can be at most 200 KB.");

export const createPageSchema = z.object({
  title: trimmed(LIMITS.pageTitleMax),
  bodyMd: pageBody.default(""),
  teamId: uuid.nullable().optional(),
  parentId: uuid.nullable().optional(),
  changeNote: optionalText(LIMITS.pageChangeNoteMax),
});
export const savePageVersionSchema = z.object({
  title: trimmed(LIMITS.pageTitleMax),
  bodyMd: pageBody,
  baseVersion: z.number().int().min(1),
  changeNote: optionalText(LIMITS.pageChangeNoteMax),
});
export const movePageSchema = z.object({
  teamId: uuid.nullable().optional(),
  parentId: uuid.nullable().optional(),
});

// -- Me / notifications -----------------------------------------------------

export const updateSettingsSchema = z.object({
  timezone: z.string().refine(isValidTimeZone, "Unknown time zone.").optional(),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{6,14}$/, "Use international format, e.g. +94771234567.")
    .nullable()
    .optional(),
  deadlineLead: z.enum(DEADLINE_LEADS).optional(),
});
export const updatePreferencesSchema = z.object({
  workflowId: z.string().max(100).optional(),
  channels: z.object({
    email: z.boolean().optional(),
    sms: z.boolean().optional(),
    inApp: z.boolean().optional(),
  }),
});

// -- Staff ------------------------------------------------------------------

export const staffListQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(["active", "suspended"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});
export const suspendOrgSchema = z.object({ reason: trimmed(LIMITS.suspendReasonMax) });
export const createCustomerSchema = z.object({
  firstName: trimmed(LIMITS.nameMax),
  lastName: trimmed(LIMITS.nameMax),
  email: z.email().trim().toLowerCase().max(254),
  password: z.string().min(8).max(128),
});
export const updateUserSchema = z
  .object({
    firstName: trimmed(LIMITS.nameMax).optional(),
    lastName: trimmed(LIMITS.nameMax).optional(),
    isActive: z.boolean().optional(),
  })
  .refine((v) => Object.values(v).some((x) => x !== undefined), "Nothing to change.");
export const setPasswordSchema = z.object({ password: z.string().min(8).max(128) });
export const aiUsageQuery = z.object({ days: z.coerce.number().int().refine((d) => [7, 30, 90].includes(d)).default(7) });
export const aiEventsQuery = z.object({
  organizationId: idParam.optional(),
  outcome: z.enum(["succeeded", "failed", "rate_limited"]).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

// -- Super admin ------------------------------------------------------------

export const createStaffSchema = z.object({
  firstName: trimmed(LIMITS.nameMax),
  lastName: trimmed(LIMITS.nameMax),
  email: z.email().trim().toLowerCase().max(254),
});
export const suspendOwnerSchema = z.object({ reason: trimmed(LIMITS.suspendReasonMax) });
export const decideDeletionSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  note: optionalText(LIMITS.deletionReasonMax),
}).refine((v) => v.decision === "approve" || !!v.note, { message: "Say why the request is rejected.", path: ["note"] });
