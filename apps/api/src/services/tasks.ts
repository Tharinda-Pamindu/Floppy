import type { AssignedTask, AssignedTaskStatus, IssueType, ListAssignedTasksQuery, Priority } from "@floppy/shared";
import { canPlanWeek, isOpenTaskStatus, issueKey, LIMITS, OPEN_TASK_STATUSES } from "@floppy/shared";
import { and, arrayContains, asc, desc, eq, gte, ilike, inArray, lt, or, sql, type SQL } from "drizzle-orm";
import type { OrgContext } from "../auth/middleware.js";
import type { Deps } from "../context.js";
import {
  assignedTasks,
  conversations,
  userSettings,
  organizationMemberships,
  organizations,
  planTasks,
  teamMemberships,
  teamRepos,
  teams,
  weeklyPlans,
} from "../db/schema.js";
import { AppError, conflict, forbidden, invalid, notFound } from "../errors.js";
import { displayName, iso, loadPeople } from "./people.js";
import { createPlan, type Actor } from "./plans.js";
import type { UserRow } from "./sync.js";
import { recordTaskEvents, type TaskChange } from "./task-events.js";
import { isUuid } from "./teams.js";

export type AssignedTaskRow = typeof assignedTasks.$inferSelect;

const PRIORITY_LABEL: Record<Priority, string> = { low: "Low", normal: "Normal", high: "High", urgent: "Urgent" };

function taskUrl(deps: Deps, orgId: string, taskId: string) {
  return `${deps.config.WEB_ORIGIN}/app/${orgId}/tasks/${taskId}`;
}

// -- Rules -----------------------------------------------------------------------

async function teamsContaining(deps: Deps, orgId: string, userId: string): Promise<string[]> {
  const rows = await deps.db
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(and(eq(teamMemberships.organizationId, orgId), eq(teamMemberships.userId, userId)));
  return rows.map((r) => r.teamId);
}

/**
 * Owners and admins assign to anyone in the org. A team lead assigns to the
 * members of a team they lead. Returns the team the task is filed under.
 */
async function resolveAssignment(
  deps: Deps,
  org: OrgContext,
  assigneeId: string,
  requestedTeamId: string | null | undefined,
): Promise<string | null> {
  const [member] = await deps.db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, org.organizationId), eq(organizationMemberships.userId, assigneeId)));
  if (!member) throw notFound("Member not found");

  if (requestedTeamId) {
    const [team] = await deps.db
      .select({ id: teams.id })
      .from(teams)
      .where(and(eq(teams.organizationId, org.organizationId), eq(teams.id, requestedTeamId)));
    if (!team) throw notFound("Team not found");
  }

  const assigneeTeams = await teamsContaining(deps, org.organizationId, assigneeId);
  if (org.isManager) {
    if (requestedTeamId !== undefined) return requestedTeamId;
    return assigneeTeams.length === 1 ? assigneeTeams[0]! : null;
  }
  const shared = org.ledTeamIds.filter((t) => assigneeTeams.includes(t));
  if (requestedTeamId) {
    if (!org.ledTeamIds.includes(requestedTeamId) || !assigneeTeams.includes(requestedTeamId)) {
      throw forbidden("Team leads can only assign to members of a team they lead.", "TEAM_LEAD_REQUIRED");
    }
    return requestedTeamId;
  }
  if (!shared.length) {
    throw forbidden("Team leads can only assign to members of a team they lead.", "TEAM_LEAD_REQUIRED");
  }
  return shared[0]!;
}

function canManageTask(org: OrgContext, userId: string, task: AssignedTaskRow) {
  return (
    org.isManager ||
    task.assignedById === userId ||
    (task.teamId !== null && org.ledTeamIds.includes(task.teamId))
  );
}

function canSee(org: OrgContext, userId: string, task: AssignedTaskRow) {
  return task.assigneeId === userId || canManageTask(org, userId, task);
}

export async function getVisibleTask(deps: Deps, org: OrgContext, userId: string, taskId: string) {
  if (!isUuid(taskId)) throw notFound("Task not found");
  const [task] = await deps.db
    .select()
    .from(assignedTasks)
    .where(and(eq(assignedTasks.organizationId, org.organizationId), eq(assignedTasks.id, taskId)));
  // Other people's tasks look like they don't exist.
  if (!task || !canSee(org, userId, task)) throw notFound("Task not found");
  return task;
}

// -- DTO -------------------------------------------------------------------------

export async function toTaskDtos(deps: Deps, org: OrgContext, userId: string, rows: AssignedTaskRow[]): Promise<AssignedTask[]> {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const people = await loadPeople(deps.db, rows.flatMap((r) => [r.assigneeId, r.assignedById]));
  const teamRows = await deps.db
    .select({ id: teams.id, name: teams.name })
    .from(teams)
    .where(inArray(teams.id, rows.flatMap((r) => (r.teamId ? [r.teamId] : [])).concat(["00000000-0000-0000-0000-000000000000"])));
  const teamNames = new Map(teamRows.map((t) => [t.id, t.name]));
  const repoIds = rows.flatMap((r) => (r.githubRepoId ? [r.githubRepoId] : []));
  const repos = repoIds.length ? await deps.db.select().from(teamRepos).where(inArray(teamRepos.id, repoIds)) : [];
  const repoMap = new Map(repos.map((r) => [r.id, r]));
  const links = await deps.db
    .select({ assignedTaskId: planTasks.assignedTaskId, planTaskId: planTasks.id, planId: weeklyPlans.id, weekStart: weeklyPlans.weekStart })
    .from(planTasks)
    .innerJoin(weeklyPlans, eq(weeklyPlans.id, planTasks.planId))
    .where(inArray(planTasks.assignedTaskId, ids));
  const linkMap = new Map(links.map((l) => [l.assignedTaskId!, l]));
  const convs = await deps.db
    .select({ id: conversations.id, taskId: conversations.taskId })
    .from(conversations)
    .where(inArray(conversations.taskId, ids));
  const convMap = new Map(convs.map((c) => [c.taskId!, c.id]));

  const unknown = (id: string) => ({ id, firstName: "", lastName: "", email: "" });
  return rows.map((t) => {
    const repo = t.githubRepoId ? repoMap.get(t.githubRepoId) : undefined;
    const link = linkMap.get(t.id);
    const manage = canManageTask(org, userId, t);
    const isAssignee = t.assigneeId === userId;
    const open = isOpenTaskStatus(t.status as AssignedTaskStatus);
    return {
      id: t.id,
      organizationId: t.organizationId,
      teamId: t.teamId,
      teamName: t.teamId ? (teamNames.get(t.teamId) ?? null) : null,
      title: t.title,
      description: t.description,
      assignee: people.get(t.assigneeId) ?? unknown(t.assigneeId),
      assignedBy: (t.assignedById && people.get(t.assignedById)) || unknown(t.assignedById ?? ""),
      deadline: t.deadline.toISOString(),
      priority: t.priority as Priority,
      status: t.status as AssignedTaskStatus,
      number: t.number,
      key: issueKey(org.organization.name, t.number),
      type: t.type as IssueType,
      storyPoints: t.storyPoints,
      labels: t.labels,
      completedAt: iso(t.completedAt),
      github:
        t.githubIssueNumber && repo
          ? {
              repoId: repo.id,
              repoFullName: `${repo.owner}/${repo.name}`,
              number: t.githubIssueNumber,
              url: t.githubIssueUrl ?? `${repo.htmlUrl}/issues/${t.githubIssueNumber}`,
              state: (t.githubIssueState as "open" | "closed" | null) ?? null,
              title: t.githubIssueTitle,
            }
          : null,
      planLink: link ? { planId: link.planId, planTaskId: link.planTaskId, weekStart: link.weekStart } : null,
      conversationId: convMap.get(t.id) ?? null,
      createdAt: t.createdAt.toISOString(),
      permissions: { edit: manage, changeStatus: isAssignee || manage, pull: isAssignee && open && !link },
    };
  });
}

// -- Queries ---------------------------------------------------------------------

/** `%` and `_` are wildcards in ILIKE; a search for them should match them literally. */
function likePattern(q: string) {
  return `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

export async function listTasks(deps: Deps, org: OrgContext, userId: string, query: ListAssignedTasksQuery) {
  const conditions: (SQL | undefined)[] = [eq(assignedTasks.organizationId, org.organizationId)];
  if (query.scope === "mine") conditions.push(eq(assignedTasks.assigneeId, userId));
  if (query.scope === "assigned_by_me") conditions.push(eq(assignedTasks.assignedById, userId));
  if (query.scope === "team") {
    if (query.teamId) {
      if (!org.isManager && !org.ledTeamIds.includes(query.teamId)) {
        throw forbidden("Only this team's lead or an organization admin can see its tasks.", "TEAM_LEAD_REQUIRED");
      }
      conditions.push(eq(assignedTasks.teamId, query.teamId));
    } else if (!org.isManager) {
      if (!org.ledTeamIds.length) return [];
      conditions.push(inArray(assignedTasks.teamId, org.ledTeamIds));
    }
  }
  if (query.status) conditions.push(eq(assignedTasks.status, query.status));
  if (query.assigneeId) conditions.push(eq(assignedTasks.assigneeId, query.assigneeId));
  if (query.type) conditions.push(eq(assignedTasks.type, query.type));
  if (query.priority) conditions.push(eq(assignedTasks.priority, query.priority));
  if (query.label) conditions.push(arrayContains(assignedTasks.labels, [query.label]));
  if (query.from && query.to) {
    conditions.push(gte(assignedTasks.deadline, new Date(query.from)), lt(assignedTasks.deadline, new Date(query.to)));
  }
  if (query.q) {
    // "FLOP-42" or "42" finds the task by its key; anything else searches titles.
    const byKey = /^(?:[a-z0-9]+-)?(\d{1,9})$/i.exec(query.q);
    const byTitle = ilike(assignedTasks.title, likePattern(query.q));
    conditions.push(byKey ? or(eq(assignedTasks.number, Number(byKey[1])), byTitle) : byTitle);
  }
  const rows = await deps.db
    .select()
    .from(assignedTasks)
    .where(and(...conditions))
    .orderBy(asc(assignedTasks.deadline), desc(assignedTasks.createdAt))
    .limit(LIMITS.taskListMax);
  return toTaskDtos(deps, org, userId, rows);
}

// -- Commands --------------------------------------------------------------------

async function githubFields(deps: Deps, org: OrgContext, repoId: string | null | undefined, issueNumber: number | null | undefined) {
  if (!repoId || !issueNumber) return {};
  const [repo] = await deps.db
    .select()
    .from(teamRepos)
    .where(and(eq(teamRepos.organizationId, org.organizationId), eq(teamRepos.id, repoId)));
  if (!repo) throw notFound("Repository not found");
  const issue = await deps.github.getIssue(repo.owner, repo.name, issueNumber).catch(() => null);
  if (!issue) throw invalid(`Issue #${issueNumber} wasn't found in ${repo.owner}/${repo.name}.`, "githubIssueNumber");
  return {
    githubRepoId: repo.id,
    githubIssueNumber: issueNumber,
    githubIssueUrl: issue.url,
    githubIssueTitle: issue.title,
    githubIssueState: issue.state,
    githubSyncedAt: deps.now(),
  };
}

async function timezoneOf(deps: Deps, userId: string) {
  const [row] = await deps.db.select({ tz: userSettings.timezone }).from(userSettings).where(eq(userSettings.userId, userId));
  return row?.tz ?? "UTC";
}

async function notifyAssigned(deps: Deps, org: OrgContext, task: AssignedTaskRow, assigner: UserRow) {
  if (task.assigneeId === assigner.id) return;
  const [repo] = task.githubRepoId ? await deps.db.select().from(teamRepos).where(eq(teamRepos.id, task.githubRepoId)) : [];
  await deps.notifier.trigger("task-assigned", task.assigneeId, {
    organizationId: org.organizationId,
    organizationName: org.organization.name,
    taskId: task.id,
    taskTitle: task.title,
    description: task.description,
    assignerName: displayName(assigner),
    deadline: task.deadline.toISOString(),
    timezone: await timezoneOf(deps, task.assigneeId),
    priority: PRIORITY_LABEL[task.priority as Priority],
    githubIssueUrl: task.githubIssueUrl,
    githubRef: repo && task.githubIssueNumber ? `${repo.owner}/${repo.name}#${task.githubIssueNumber}` : null,
    url: taskUrl(deps, org.organizationId, task.id),
  });
}

export async function createTask(
  deps: Deps,
  org: OrgContext,
  user: UserRow,
  input: {
    title: string;
    description?: string | null;
    assigneeId: string;
    teamId?: string | null;
    deadline: string;
    priority: Priority;
    type: IssueType;
    storyPoints?: number | null;
    labels: string[];
    githubRepoId?: string | null;
    githubIssueNumber?: number | null;
  },
) {
  if (!org.isManager && !org.ledTeamIds.length) {
    throw forbidden("Only team leads, owners and admins can assign tasks.", "TEAM_LEAD_REQUIRED");
  }
  const teamId = await resolveAssignment(deps, org, input.assigneeId, input.teamId);
  const github = await githubFields(deps, org, input.githubRepoId, input.githubIssueNumber);
  const task = await deps.db.transaction(async (tx) => {
    // One atomic bump of the organization's counter: two tasks created at once never share a key.
    const [seq] = await tx
      .update(organizations)
      .set({ taskSeq: sql`${organizations.taskSeq} + 1` })
      .where(eq(organizations.id, org.organizationId))
      .returning({ number: organizations.taskSeq });
    const [row] = await tx
      .insert(assignedTasks)
      .values({
        organizationId: org.organizationId,
        teamId,
        title: input.title,
        description: input.description ?? null,
        assigneeId: input.assigneeId,
        assignedById: user.id,
        deadline: new Date(input.deadline),
        priority: input.priority,
        number: seq!.number,
        type: input.type,
        storyPoints: input.storyPoints ?? null,
        labels: input.labels,
        ...github,
      })
      .returning();
    await recordTaskEvents(tx, { organizationId: org.organizationId, taskId: row!.id, actorId: user.id }, [{ field: "created" }]);
    return row!;
  });
  await notifyAssigned(deps, org, task, user);
  return task;
}

const joinLabels = (labels: string[]) => (labels.length ? labels.join(", ") : null);

/** What an update changes, as history entries (only fields whose value really moved). */
function diffTask(before: AssignedTaskRow, after: Partial<AssignedTaskRow>): TaskChange[] {
  const out: TaskChange[] = [];
  const add = (field: TaskChange["field"], from: string | null, to: string | null) => {
    if (from !== to) out.push({ field, from, to });
  };
  if (after.title !== undefined) add("title", before.title, after.title);
  if (after.description !== undefined && (after.description ?? null) !== (before.description ?? null)) {
    out.push({ field: "description" });
  }
  if (after.assigneeId !== undefined) add("assignee", before.assigneeId, after.assigneeId);
  if (after.deadline !== undefined) add("deadline", before.deadline.toISOString(), after.deadline.toISOString());
  if (after.priority !== undefined) add("priority", before.priority, after.priority);
  if (after.status !== undefined) add("status", before.status, after.status);
  if (after.type !== undefined) add("type", before.type, after.type);
  if (after.storyPoints !== undefined) {
    add("story_points", before.storyPoints?.toString() ?? null, after.storyPoints?.toString() ?? null);
  }
  if (after.labels !== undefined) add("labels", joinLabels(before.labels), joinLabels(after.labels));
  return out;
}

export async function updateTask(
  deps: Deps,
  org: OrgContext,
  user: UserRow,
  task: AssignedTaskRow,
  input: {
    title?: string;
    description?: string | null;
    assigneeId?: string;
    deadline?: string;
    priority?: Priority;
    status?: AssignedTaskStatus;
    type?: IssueType;
    storyPoints?: number | null;
    labels?: string[];
  },
) {
  const manage = canManageTask(org, user.id, task);
  const isAssignee = task.assigneeId === user.id;
  const editsDetails =
    input.title !== undefined ||
    input.description !== undefined ||
    input.assigneeId !== undefined ||
    input.deadline !== undefined ||
    input.priority !== undefined ||
    input.type !== undefined ||
    input.storyPoints !== undefined ||
    input.labels !== undefined;
  if (editsDetails && !manage) {
    throw forbidden("Only the person who assigned this task, a team lead or an admin can change it.", "TASK_MANAGER_REQUIRED");
  }
  if (input.status !== undefined) {
    if (!manage && !isAssignee) throw forbidden("You can't change this task's status.", "TASK_MANAGER_REQUIRED");
    if (input.status === "cancelled" && !manage) {
      throw forbidden("Only the person who assigned this task, a team lead or an admin can cancel it.", "TASK_MANAGER_REQUIRED");
    }
    if (task.status === "cancelled" && input.status !== "cancelled" && !manage) {
      throw new AppError(409, "TASK_CANCELLED", "This task was cancelled.");
    }
  }

  const now = deps.now();
  const changes: Partial<AssignedTaskRow> = { updatedAt: now };
  if (input.title !== undefined) changes.title = input.title;
  if (input.description !== undefined) changes.description = input.description;
  if (input.deadline !== undefined) changes.deadline = new Date(input.deadline);
  if (input.priority !== undefined) changes.priority = input.priority;
  if (input.type !== undefined) changes.type = input.type;
  if (input.storyPoints !== undefined) changes.storyPoints = input.storyPoints;
  if (input.labels !== undefined) changes.labels = input.labels;
  if (input.assigneeId !== undefined && input.assigneeId !== task.assigneeId) {
    changes.teamId = await resolveAssignment(deps, org, input.assigneeId, task.teamId ?? undefined);
    changes.assigneeId = input.assigneeId;
  }
  if (input.status !== undefined) {
    changes.status = input.status;
    changes.completedAt = input.status === "done" ? (task.completedAt ?? now) : null;
  }

  await deps.db.transaction(async (tx) => {
    await tx.update(assignedTasks).set(changes).where(eq(assignedTasks.id, task.id));
    await recordTaskEvents(tx, { organizationId: org.organizationId, taskId: task.id, actorId: user.id }, diffTask(task, changes));
    if (changes.assigneeId) {
      // A reassigned task leaves the previous person's plan link behind.
      await tx.update(planTasks).set({ assignedTaskId: null }).where(eq(planTasks.assignedTaskId, task.id));
    }
    if (input.status !== undefined) {
      // Completing the task ticks the linked plan task, but only on an approved plan.
      const links = await tx
        .select({ planTaskId: planTasks.id, status: weeklyPlans.status })
        .from(planTasks)
        .innerJoin(weeklyPlans, eq(weeklyPlans.id, planTasks.planId))
        .where(eq(planTasks.assignedTaskId, task.id));
      for (const link of links) {
        if (link.status !== "approved") continue;
        const done = input.status === "done";
        await tx.update(planTasks).set({ isDone: done, doneAt: done ? now : null }).where(eq(planTasks.id, link.planTaskId));
      }
    }
  });

  const [updated] = await deps.db.select().from(assignedTasks).where(eq(assignedTasks.id, task.id));
  const fresh = updated!;
  if (changes.assigneeId) {
    await notifyAssigned(deps, org, fresh, user);
  } else if (editsDetails && fresh.assigneeId !== user.id) {
    await deps.notifier.trigger("task-updated", fresh.assigneeId, {
      organizationId: org.organizationId,
      taskId: fresh.id,
      taskTitle: fresh.title,
      changedBy: displayName(user),
      deadline: fresh.deadline.toISOString(),
      timezone: await timezoneOf(deps, fresh.assigneeId),
      priority: PRIORITY_LABEL[fresh.priority as Priority],
      url: taskUrl(deps, org.organizationId, fresh.id),
    });
  }
  if (input.status === "done" && task.status !== "done" && fresh.assignedById && fresh.assignedById !== user.id) {
    await deps.notifier.trigger("task-completed", fresh.assignedById, {
      organizationId: org.organizationId,
      taskId: fresh.id,
      taskTitle: fresh.title,
      completedBy: displayName(user),
      url: taskUrl(deps, org.organizationId, fresh.id),
    });
  }
  return fresh;
}

/** The assignee adds the task to their (draft) plan for a week, creating the draft if needed. */
export async function pullIntoPlan(
  deps: Deps,
  org: OrgContext,
  actor: Actor,
  task: AssignedTaskRow,
  input: { weekStart: string; kind: "main" | "sub_goal" },
) {
  if (task.assigneeId !== actor.userId) throw forbidden("Only the assignee can plan this task.", "ASSIGNEE_REQUIRED");
  if (task.status === "done" || task.status === "cancelled") {
    throw new AppError(409, "TASK_CLOSED", "This task is already closed.");
  }
  const [existingLink] = await deps.db.select({ id: planTasks.id }).from(planTasks).where(eq(planTasks.assignedTaskId, task.id));
  if (existingLink) throw conflict("This task is already in one of your plans.", "ALREADY_PLANNED");
  if (!canPlanWeek(input.weekStart, deps.now())) throw invalid("You can plan last week, this week or next week.", "weekStart");

  let [plan] = await deps.db
    .select()
    .from(weeklyPlans)
    .where(
      and(
        eq(weeklyPlans.organizationId, org.organizationId),
        eq(weeklyPlans.userId, actor.userId),
        eq(weeklyPlans.weekStart, input.weekStart),
      ),
    );
  if (!plan) plan = await createPlan(deps, actor, { weekStart: input.weekStart, tasks: [] });
  if (plan.status !== "draft") {
    throw new AppError(409, "INVALID_PLAN_STATUS", "That week's plan is no longer a draft. Withdraw it first to add tasks.");
  }
  const existing = await deps.db.select().from(planTasks).where(eq(planTasks.planId, plan.id));
  if (input.kind === "main" && existing.some((t) => t.kind === "main")) {
    throw conflict("That plan already has a main task. Add this one as a sub-goal instead.", "MAIN_TASK_EXISTS", "kind");
  }
  if (existing.length >= 15) throw invalid("A weekly plan has at most 15 tasks. Keep it focused.", "tasks");
  await deps.db.transaction(async (tx) => {
    await tx.insert(planTasks).values({
      planId: plan!.id,
      kind: input.kind,
      title: task.title,
      position: existing.length,
      assignedTaskId: task.id,
    });
    if (task.status === "todo") {
      await tx.update(assignedTasks).set({ status: "in_progress", updatedAt: deps.now() }).where(eq(assignedTasks.id, task.id));
      await recordTaskEvents(
        tx,
        { organizationId: org.organizationId, taskId: task.id, actorId: actor.userId },
        [{ field: "status", from: "todo", to: "in_progress" }],
      );
    }
    await tx.update(weeklyPlans).set({ updatedAt: deps.now() }).where(eq(weeklyPlans.id, plan!.id));
  });
  return plan;
}

/** Assigned tasks that are still open, for the plan editor's "add from my tasks" picker. */
export async function openTasksFor(deps: Deps, org: OrgContext, userId: string) {
  const rows = await deps.db
    .select()
    .from(assignedTasks)
    .where(
      and(
        eq(assignedTasks.organizationId, org.organizationId),
        eq(assignedTasks.assigneeId, userId),
        inArray(assignedTasks.status, [...OPEN_TASK_STATUSES]),
      ),
    )
    .orderBy(asc(assignedTasks.deadline));
  return toTaskDtos(deps, org, userId, rows);
}

/** Refresh a task's GitHub issue state (cached for 5 minutes). */
export async function refreshGithubState(deps: Deps, task: AssignedTaskRow) {
  if (!task.githubRepoId || !task.githubIssueNumber) return task;
  if (task.githubSyncedAt && deps.now().getTime() - task.githubSyncedAt.getTime() < 5 * 60_000) return task;
  const [repo] = await deps.db.select().from(teamRepos).where(eq(teamRepos.id, task.githubRepoId));
  if (!repo) return task;
  const issue = await deps.github.getIssue(repo.owner, repo.name, task.githubIssueNumber).catch(() => null);
  if (!issue) return task;
  const [updated] = await deps.db
    .update(assignedTasks)
    .set({ githubIssueState: issue.state, githubIssueTitle: issue.title, githubSyncedAt: deps.now() })
    .where(eq(assignedTasks.id, task.id))
    .returning();
  return updated ?? task;
}
