import { createHash } from "node:crypto";
import type { AiReview, Plan, PlanPermissions, PlanStatus, TaskInput, TeamWeekRow, WeekRollup } from "@floppy/shared";
import { canPlanWeek, isMonday, LIMITS, MANAGER_ROLES, weekLabel } from "@floppy/shared";
import { aliasedTable, and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import type { OrgContext } from "../auth/middleware.js";
import type { Deps } from "../context.js";
import type { Db } from "../db/client.js";
import {
  assignedTasks,
  organizationMemberships,
  planReviews,
  planTasks,
  teamMemberships,
  weeklyPlans,
} from "../db/schema.js";
import { AppError, conflict, forbidden, invalid, notFound } from "../errors.js";
import { displayName, iso, loadPeople } from "./people.js";
import { recordTaskEvents } from "./task-events.js";
import type { UserRow } from "./sync.js";
import { isUuid, loadTeam, requireTeamViewer, teamMembers } from "./teams.js";

export type PlanRow = typeof weeklyPlans.$inferSelect;
export type PlanTaskRow = typeof planTasks.$inferSelect;

/** The person acting, inside the organization in the URL. */
export interface Actor {
  userId: string;
  organizationId: string;
  role: OrgContext["role"];
}

export const actorOf = (org: OrgContext, user: UserRow): Actor => ({
  userId: user.id,
  organizationId: org.organizationId,
  role: org.role,
});

const invalidStatus = (plan: PlanRow, expected: PlanStatus, action: string) =>
  new AppError(409, "INVALID_PLAN_STATUS", `Only a ${expected} plan can be ${action}. This plan is ${plan.status}.`);

// -- Who may see and approve what ------------------------------------------------

/** Does `userId` lead any team in the org? */
async function isLead(db: Db, orgId: string, userId: string): Promise<boolean> {
  const [row] = await db
    .select({ n: count() })
    .from(teamMemberships)
    .where(and(eq(teamMemberships.organizationId, orgId), eq(teamMemberships.userId, userId), eq(teamMemberships.isLead, true)));
  return (row?.n ?? 0) > 0;
}

/**
 * A lead of a team the author is in may approve, never the author. A lead's
 * own plan may also be approved by an org owner or admin.
 */
export async function canApprove(db: Db, actor: Actor, authorId: string): Promise<boolean> {
  if (actor.userId === authorId) return false;
  const lead = aliasedTable(teamMemberships, "lead");
  const member = aliasedTable(teamMemberships, "member");
  const [shared] = await db
    .select({ n: count() })
    .from(lead)
    .innerJoin(member, eq(member.teamId, lead.teamId))
    .where(
      and(
        eq(lead.organizationId, actor.organizationId),
        eq(lead.userId, actor.userId),
        eq(lead.isLead, true),
        eq(member.userId, authorId),
      ),
    );
  if ((shared?.n ?? 0) > 0) return true;
  if (MANAGER_ROLES.includes(actor.role)) return isLead(db, actor.organizationId, authorId);
  return false;
}

/** Everyone who could approve `authorId`'s plan (for notifications). */
export async function approverIds(db: Db, orgId: string, authorId: string): Promise<string[]> {
  const lead = aliasedTable(teamMemberships, "lead");
  const member = aliasedTable(teamMemberships, "member");
  const leads = await db
    .selectDistinct({ userId: lead.userId })
    .from(member)
    .innerJoin(lead, and(eq(lead.teamId, member.teamId), eq(lead.isLead, true)))
    .where(and(eq(member.organizationId, orgId), eq(member.userId, authorId), ne(lead.userId, authorId)));
  const ids = new Set(leads.map((l) => l.userId));
  if (await isLead(db, orgId, authorId)) {
    const managers = await db
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, orgId),
          inArray(organizationMemberships.role, ["owner", "admin"]),
          ne(organizationMemberships.userId, authorId),
        ),
      );
    for (const m of managers) ids.add(m.userId);
  }
  return [...ids];
}

/** Drafts are private to the author; submitted plans are visible to possible approvers. */
export async function canRead(db: Db, actor: Actor, plan: PlanRow): Promise<boolean> {
  if (plan.userId === actor.userId) return true;
  return plan.status !== "draft" && (await canApprove(db, actor, plan.userId));
}

// -- Reading --------------------------------------------------------------------

export function planContentHash(tasks: Pick<PlanTaskRow, "id" | "kind" | "title" | "why" | "estimateHours" | "position">[]) {
  const content = [...tasks]
    .sort((a, b) => a.position - b.position)
    .map((t) => [t.id, t.kind, t.title, t.why, t.estimateHours]);
  return createHash("sha256").update(JSON.stringify(content)).digest("hex");
}

export async function loadPlanRow(db: Db, orgId: string, planId: string): Promise<PlanRow | null> {
  if (!isUuid(planId)) return null;
  const [plan] = await db
    .select()
    .from(weeklyPlans)
    .where(and(eq(weeklyPlans.organizationId, orgId), eq(weeklyPlans.id, planId)));
  return plan ?? null;
}

export async function loadTasks(db: Db, planId: string) {
  return db.select().from(planTasks).where(eq(planTasks.planId, planId)).orderBy(asc(planTasks.position));
}

/** A plan the actor may read, or 404 (plans they can't read look like they don't exist). */
export async function getReadablePlan(deps: Deps, actor: Actor, planId: string): Promise<PlanRow> {
  const plan = await loadPlanRow(deps.db, actor.organizationId, planId);
  if (!plan || !(await canRead(deps.db, actor, plan))) throw notFound("Plan not found");
  return plan;
}

export async function toPlanDto(deps: Deps, actor: Actor, plan: PlanRow): Promise<Plan> {
  const tasks = await loadTasks(deps.db, plan.id);
  const reviews = await deps.db
    .select()
    .from(planReviews)
    .where(eq(planReviews.planId, plan.id))
    .orderBy(asc(planReviews.createdAt));
  const people = await loadPeople(deps.db, [plan.userId, plan.approvedById, ...reviews.map((r) => r.reviewerId)]);
  const isAuthor = plan.userId === actor.userId;
  const reviewer = !isAuthor && plan.status === "submitted" && (await canApprove(deps.db, actor, plan.userId));

  const permissions: PlanPermissions = {
    edit: isAuthor && plan.status === "draft",
    submit: isAuthor && plan.status === "draft",
    withdraw: isAuthor && plan.status === "submitted",
    review: reviewer,
    tickTasks: isAuthor && plan.status === "approved",
    complete: isAuthor && plan.status === "approved",
    aiReview: isAuthor && plan.status === "draft" && deps.ai !== null,
  };

  let aiReview: AiReview | null = null;
  // The AI review is the author's working aid; only the author sees it.
  if (isAuthor && plan.aiReview && plan.aiReviewedAt) {
    const stored = plan.aiReview as Omit<AiReview, "reviewedAt" | "isStale">;
    aiReview = {
      ...stored,
      reviewedAt: plan.aiReviewedAt.toISOString(),
      isStale: plan.aiReviewPlanHash !== planContentHash(tasks),
    };
  }

  return {
    id: plan.id,
    organizationId: plan.organizationId,
    author: people.get(plan.userId) ?? { id: plan.userId, firstName: "", lastName: "", email: "" },
    weekStart: plan.weekStart,
    status: plan.status as PlanStatus,
    submittedAt: iso(plan.submittedAt),
    approvedAt: iso(plan.approvedAt),
    approvedBy: plan.approvedById ? (people.get(plan.approvedById) ?? null) : null,
    completedAt: iso(plan.completedAt),
    mainGoalShipped: plan.mainGoalShipped,
    outcomeNote: plan.outcomeNote,
    tasks: tasks.map((t) => ({
      id: t.id,
      kind: t.kind as Plan["tasks"][number]["kind"],
      title: t.title,
      why: t.why,
      estimateHours: t.estimateHours,
      position: t.position,
      isDone: t.isDone,
      doneAt: iso(t.doneAt),
      assignedTaskId: t.assignedTaskId,
    })),
    reviews: reviews.map((r) => ({
      id: r.id,
      action: r.action as "approved" | "changes_requested",
      comment: r.comment,
      reviewer: r.reviewerId ? (people.get(r.reviewerId) ?? null) : null,
      createdAt: r.createdAt.toISOString(),
    })),
    aiReview,
    permissions,
    createdAt: plan.createdAt.toISOString(),
    updatedAt: iso(plan.updatedAt),
  };
}

export async function listMyPlans(
  deps: Deps,
  actor: Actor,
  query: { weekStart?: string; limit: number; offset: number },
) {
  const where = and(
    eq(weeklyPlans.organizationId, actor.organizationId),
    eq(weeklyPlans.userId, actor.userId),
    query.weekStart ? eq(weeklyPlans.weekStart, query.weekStart) : undefined,
  );
  const [total] = await deps.db.select({ n: count() }).from(weeklyPlans).where(where);
  const rows = await deps.db
    .select()
    .from(weeklyPlans)
    .where(where)
    .orderBy(desc(weeklyPlans.weekStart))
    .limit(query.limit)
    .offset(query.offset);
  const items = await Promise.all(rows.map((p) => toPlanDto(deps, actor, p)));
  return { items, total: total?.n ?? 0, limit: query.limit, offset: query.offset };
}

/** Submitted plans this person can approve, oldest first. */
export async function listAwaitingApproval(deps: Deps, actor: Actor): Promise<Plan[]> {
  const rows = await deps.db
    .select()
    .from(weeklyPlans)
    .where(
      and(
        eq(weeklyPlans.organizationId, actor.organizationId),
        eq(weeklyPlans.status, "submitted"),
        ne(weeklyPlans.userId, actor.userId),
      ),
    )
    .orderBy(asc(weeklyPlans.submittedAt));
  const result: Plan[] = [];
  for (const plan of rows) {
    if (await canApprove(deps.db, actor, plan.userId)) result.push(await toPlanDto(deps, actor, plan));
  }
  return result;
}

// -- Writing -----------------------------------------------------------------------

function requireAuthor(actor: Actor, plan: PlanRow) {
  if (plan.userId !== actor.userId) throw forbidden("Only the plan's author can do this.", "PLAN_AUTHOR_REQUIRED");
}

export async function createPlan(deps: Deps, actor: Actor, input: { weekStart: string; tasks: TaskInput[] }) {
  if (!isMonday(input.weekStart)) throw invalid("A plan's week starts on a Monday.", "weekStart");
  if (!canPlanWeek(input.weekStart, deps.now())) {
    throw invalid("You can plan last week, this week or next week.", "weekStart");
  }
  const [existing] = await deps.db
    .select({ id: weeklyPlans.id })
    .from(weeklyPlans)
    .where(
      and(
        eq(weeklyPlans.organizationId, actor.organizationId),
        eq(weeklyPlans.userId, actor.userId),
        eq(weeklyPlans.weekStart, input.weekStart),
      ),
    );
  if (existing) throw conflict("You already have a plan for that week.", "PLAN_EXISTS", "weekStart");

  const plan = await deps.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(weeklyPlans)
      .values({ organizationId: actor.organizationId, userId: actor.userId, weekStart: input.weekStart, status: "draft" })
      .returning();
    await applyTasks(tx as unknown as Db, actor, created!, input.tasks);
    return created!;
  });
  return plan;
}

export async function replaceTasks(deps: Deps, actor: Actor, plan: PlanRow, tasks: TaskInput[]) {
  requireAuthor(actor, plan);
  if (plan.status !== "draft") throw invalidStatus(plan, "draft", "edited");
  await deps.db.transaction(async (tx) => {
    await applyTasks(tx as unknown as Db, actor, plan, tasks);
    await tx.update(weeklyPlans).set({ updatedAt: deps.now() }).where(eq(weeklyPlans.id, plan.id));
  });
}

/**
 * Make the plan's tasks match `tasks`, in order. Tasks sent with an id are
 * updated in place, so their ids (and AI findings about them) stay stable; the
 * rest are created, and missing ones are deleted.
 */
async function applyTasks(db: Db, actor: Actor, plan: PlanRow, tasks: TaskInput[]) {
  if (tasks.length > LIMITS.maxPlanTasks) {
    throw invalid(`A weekly plan has at most ${LIMITS.maxPlanTasks} tasks. Keep it focused.`, "tasks");
  }
  if (tasks.filter((t) => t.kind === "main").length > 1) throw invalid("A plan has exactly one main task.", "tasks");
  if (tasks.some((t) => t.why && t.kind !== "main")) throw invalid("Only the main task has a 'why'.", "tasks");

  const existing = await loadTasks(db, plan.id);
  const byId = new Map(existing.map((t) => [t.id, t]));
  const sentIds = new Set(tasks.flatMap((t) => (t.id ? [t.id] : [])));
  for (const id of sentIds) {
    if (!byId.has(id)) throw invalid(`Task ${id} is not part of this plan.`, "tasks");
  }

  // Linked assigned tasks must be the author's own, in this organization.
  const linkIds = [...new Set(tasks.flatMap((t) => (t.assignedTaskId ? [t.assignedTaskId] : [])))];
  if (linkIds.length) {
    const owned = await db
      .select({ id: assignedTasks.id })
      .from(assignedTasks)
      .where(
        and(
          inArray(assignedTasks.id, linkIds),
          eq(assignedTasks.organizationId, actor.organizationId),
          eq(assignedTasks.assigneeId, plan.userId),
        ),
      );
    if (owned.length !== linkIds.length) throw invalid("That assigned task isn't yours to plan.", "tasks");
  }

  // Deletes first, then updates that move a task away from "main", then the
  // rest: the one-main-task index is checked row by row.
  const removed = existing.filter((t) => !sentIds.has(t.id)).map((t) => t.id);
  if (removed.length) await db.delete(planTasks).where(inArray(planTasks.id, removed));

  const ordered = tasks.map((t, position) => ({ t, position })).sort((a, b) => Number(a.t.kind === "main") - Number(b.t.kind === "main"));
  for (const { t, position } of ordered) {
    if (!t.id) continue;
    await db
      .update(planTasks)
      .set({
        kind: t.kind,
        title: t.title,
        why: t.kind === "main" ? (t.why ?? null) : null,
        estimateHours: t.estimateHours ?? null,
        position,
        assignedTaskId: t.assignedTaskId ?? byId.get(t.id)?.assignedTaskId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(planTasks.id, t.id));
  }
  const fresh = tasks
    .map((t, position) => ({ t, position }))
    .filter(({ t }) => !t.id)
    .map(({ t, position }) => ({
      planId: plan.id,
      kind: t.kind,
      title: t.title,
      why: t.kind === "main" ? (t.why ?? null) : null,
      estimateHours: t.estimateHours ?? null,
      position,
      assignedTaskId: t.assignedTaskId ?? null,
    }));
  if (fresh.length) await db.insert(planTasks).values(fresh);
}

export async function setTaskDone(deps: Deps, actor: Actor, plan: PlanRow, taskId: string, isDone: boolean) {
  requireAuthor(actor, plan);
  if (plan.status !== "approved") throw invalidStatus(plan, "approved", "ticked off");
  const tasks = await loadTasks(deps.db, plan.id);
  const task = tasks.find((t) => t.id === taskId);
  if (!task) throw notFound("Task not found");
  const now = deps.now();
  await deps.db.update(planTasks).set({ isDone, doneAt: isDone ? now : null, updatedAt: now }).where(eq(planTasks.id, taskId));

  // Keep a linked assigned task in step.
  if (task.assignedTaskId) {
    const [assigned] = await deps.db.select().from(assignedTasks).where(eq(assignedTasks.id, task.assignedTaskId));
    if (assigned && assigned.status !== "cancelled") {
      const status = isDone ? "done" : assigned.status === "done" ? "in_progress" : assigned.status;
      await deps.db
        .update(assignedTasks)
        .set({ status, completedAt: isDone ? now : null, updatedAt: now })
        .where(eq(assignedTasks.id, assigned.id));
      if (status !== assigned.status) {
        await recordTaskEvents(
          deps.db,
          { organizationId: assigned.organizationId, taskId: assigned.id, actorId: actor.userId },
          [{ field: "status", from: assigned.status, to: status }],
        );
      }
      if (isDone && assigned.status !== "done" && assigned.assignedById) {
        await deps.notifier.trigger("task-completed", assigned.assignedById, {
          organizationId: actor.organizationId,
          taskId: assigned.id,
          taskTitle: assigned.title,
          url: `${deps.config.WEB_ORIGIN}/app/${actor.organizationId}/tasks/${assigned.id}`,
        });
      }
    }
  }
}

export async function submitPlan(deps: Deps, actor: Actor, plan: PlanRow, author: UserRow) {
  requireAuthor(actor, plan);
  if (plan.status !== "draft") throw invalidStatus(plan, "draft", "submitted");
  const tasks = await loadTasks(deps.db, plan.id);
  const main = tasks.find((t) => t.kind === "main");
  if (!main) throw invalid("Add a main task: the one significant thing to ship this week.", "tasks");
  if (!main.why?.trim()) throw invalid("Say why the main task matters before submitting.", "tasks");
  const approvers = await approverIds(deps.db, actor.organizationId, plan.userId);
  if (!approvers.length) {
    throw new AppError(
      409,
      "NO_APPROVER",
      "Nobody can approve this plan yet. Ask an admin to add you to a team that has a lead.",
    );
  }
  const now = deps.now();
  await deps.db.update(weeklyPlans).set({ status: "submitted", submittedAt: now, updatedAt: now }).where(eq(weeklyPlans.id, plan.id));

  const payload = {
    organizationId: actor.organizationId,
    planId: plan.id,
    authorName: displayName(author),
    weekLabel: weekLabel(plan.weekStart, now),
    mainTask: main.title,
    url: `${deps.config.WEB_ORIGIN}/app/${actor.organizationId}/plans/${plan.id}`,
  };
  await deps.notifier.trigger("plan-submitted", approvers, payload);
  // Reminds approvers after 24h unless the plan has been decided (the workflow checks).
  await deps.notifier.trigger("approval-overdue", approvers, payload, {
    transactionId: `approval-overdue-${plan.id}-${now.getTime()}`,
  });
}

export async function withdrawPlan(deps: Deps, actor: Actor, plan: PlanRow) {
  requireAuthor(actor, plan);
  if (plan.status !== "submitted") throw invalidStatus(plan, "submitted", "withdrawn");
  await deps.db
    .update(weeklyPlans)
    .set({ status: "draft", submittedAt: null, updatedAt: deps.now() })
    .where(eq(weeklyPlans.id, plan.id));
}

async function requireApprover(deps: Deps, actor: Actor, plan: PlanRow) {
  if (plan.userId === actor.userId) throw forbidden("You can't approve your own plan.", "SELF_APPROVAL");
  if (!(await canApprove(deps.db, actor, plan.userId))) {
    throw forbidden("Only a lead of the author's team can review this plan.", "TEAM_LEAD_REQUIRED");
  }
}

export async function approvePlan(deps: Deps, actor: Actor, plan: PlanRow, reviewer: UserRow, comment: string | null) {
  await requireApprover(deps, actor, plan);
  if (plan.status !== "submitted") throw invalidStatus(plan, "submitted", "approved");
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    await tx
      .update(weeklyPlans)
      .set({ status: "approved", approvedAt: now, approvedById: actor.userId, updatedAt: now })
      .where(eq(weeklyPlans.id, plan.id));
    await tx.insert(planReviews).values({ planId: plan.id, reviewerId: actor.userId, action: "approved", comment });
  });
  await deps.notifier.trigger("plan-approved", plan.userId, {
    organizationId: actor.organizationId,
    planId: plan.id,
    reviewerName: displayName(reviewer),
    weekLabel: weekLabel(plan.weekStart, now),
    comment,
    url: `${deps.config.WEB_ORIGIN}/app/${actor.organizationId}/week?week=${plan.weekStart}`,
  });
}

/** Send the plan back to its author as a draft, with a comment. */
export async function requestChanges(deps: Deps, actor: Actor, plan: PlanRow, reviewer: UserRow, comment: string) {
  await requireApprover(deps, actor, plan);
  if (plan.status !== "submitted") throw invalidStatus(plan, "submitted", "sent back");
  const now = deps.now();
  await deps.db.transaction(async (tx) => {
    await tx
      .update(weeklyPlans)
      .set({ status: "draft", submittedAt: null, updatedAt: now })
      .where(eq(weeklyPlans.id, plan.id));
    await tx
      .insert(planReviews)
      .values({ planId: plan.id, reviewerId: actor.userId, action: "changes_requested", comment });
  });
  await deps.notifier.trigger("plan-changes-requested", plan.userId, {
    organizationId: actor.organizationId,
    planId: plan.id,
    reviewerName: displayName(reviewer),
    weekLabel: weekLabel(plan.weekStart, now),
    comment,
    url: `${deps.config.WEB_ORIGIN}/app/${actor.organizationId}/week?week=${plan.weekStart}`,
  });
}

export async function completePlan(
  deps: Deps,
  actor: Actor,
  plan: PlanRow,
  input: { mainGoalShipped: boolean; outcomeNote?: string | null },
) {
  requireAuthor(actor, plan);
  if (plan.status !== "approved") throw invalidStatus(plan, "approved", "closed");
  const now = deps.now();
  await deps.db
    .update(weeklyPlans)
    .set({
      status: "done",
      completedAt: now,
      mainGoalShipped: input.mainGoalShipped,
      outcomeNote: input.outcomeNote ?? null,
      updatedAt: now,
    })
    .where(eq(weeklyPlans.id, plan.id));
}

// -- The team's week -------------------------------------------------------------------

export async function teamWeek(deps: Deps, org: OrgContext, actor: Actor, teamId: string, weekStart: string): Promise<TeamWeekRow[]> {
  const team = await loadTeam(deps.db, org.organizationId, teamId);
  requireTeamViewer(org, team.id);
  if (!isMonday(weekStart)) throw invalid("A plan's week starts on a Monday.", "weekStart");
  const members = (await teamMembers(deps.db, [team.id])).get(team.id) ?? [];
  const ids = members.map((m) => m.id);
  const plans = ids.length
    ? await deps.db
        .select()
        .from(weeklyPlans)
        .where(
          and(
            eq(weeklyPlans.organizationId, org.organizationId),
            eq(weeklyPlans.weekStart, weekStart),
            inArray(weeklyPlans.userId, ids),
          ),
        )
    : [];
  const byUser = new Map(plans.map((p) => [p.userId, p]));
  const rows: TeamWeekRow[] = [];
  for (const member of members) {
    const plan = byUser.get(member.id);
    if (!plan) {
      rows.push({ member, plan: null });
      continue;
    }
    const readable = await canRead(deps.db, actor, plan);
    const tasks = readable ? await loadTasks(deps.db, plan.id) : [];
    rows.push({
      member,
      plan: {
        id: plan.id,
        status: plan.status as PlanStatus,
        readable,
        mainTaskTitle: readable ? (tasks.find((t) => t.kind === "main")?.title ?? null) : null,
        tasksDone: tasks.filter((t) => t.isDone).length,
        tasksTotal: tasks.length,
        mainGoalShipped: plan.mainGoalShipped,
      },
    });
  }
  return rows;
}

/** Per-week rollup over the team's current members, newest week first. */
export async function teamHistory(deps: Deps, org: OrgContext, teamId: string, limit: number, offset: number) {
  const team = await loadTeam(deps.db, org.organizationId, teamId);
  requireTeamViewer(org, team.id);
  const members = (await teamMembers(deps.db, [team.id])).get(team.id) ?? [];
  const ids = members.map((m) => m.id);
  if (!ids.length) return { items: [] as WeekRollup[], total: 0, limit, offset };
  const where = and(eq(weeklyPlans.organizationId, org.organizationId), inArray(weeklyPlans.userId, ids));
  const [total] = await deps.db.select({ n: sql<number>`count(distinct ${weeklyPlans.weekStart})::int` }).from(weeklyPlans).where(where);
  const rows = await deps.db
    .select({
      weekStart: weeklyPlans.weekStart,
      submitted: sql<number>`count(*) filter (where ${weeklyPlans.status} <> 'draft')::int`,
      approved: sql<number>`count(*) filter (where ${weeklyPlans.status} in ('approved','done'))::int`,
      closed: sql<number>`count(*) filter (where ${weeklyPlans.status} = 'done')::int`,
      shipped: sql<number>`count(*) filter (where ${weeklyPlans.status} = 'done' and ${weeklyPlans.mainGoalShipped})::int`,
    })
    .from(weeklyPlans)
    .where(where)
    .groupBy(weeklyPlans.weekStart)
    .orderBy(desc(weeklyPlans.weekStart))
    .limit(limit)
    .offset(offset);
  const items: WeekRollup[] = rows.map((r) => ({ ...r, memberCount: ids.length }));
  return { items, total: Number(total?.n ?? 0), limit, offset };
}
