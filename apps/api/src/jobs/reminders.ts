/**
 * Scheduled reminders. node-cron runs `runReminders` every 15 minutes; each
 * reminder is recorded in reminder_sends first, so a reminder goes out at
 * most once no matter how often the job runs (or how many API instances run it).
 */
import { DEADLINE_LEAD_MS, type DeadlineLead, weekLabel, zonedParts } from "@floppy/shared";
import { and, eq, inArray, isNull, lte, or } from "drizzle-orm";
import cron from "node-cron";
import type { Deps } from "../context.js";
import {
  assignedTasks,
  organizationMemberships,
  organizations,
  reminderSends,
  userSettings,
  users,
  weeklyPlans,
} from "../db/schema.js";
import { logger } from "../logger.js";

export const WEEKLY_PLAN_HOUR = 9; // Monday 09:00 local
export const WEEK_CLOSE_HOUR = 16; // Friday 16:00 local

/** Which weekly reminder (if any) is due for someone whose local time is `parts`. */
export function weeklyReminderDue(parts: { weekday: number; hour: number }): "weekly-plan" | "week-close" | null {
  if (parts.weekday === 1 && parts.hour === WEEKLY_PLAN_HOUR) return "weekly-plan";
  if (parts.weekday === 5 && parts.hour === WEEK_CLOSE_HOUR) return "week-close";
  return null;
}

/** Deadline reminder state for one open task. */
export function deadlineState(deadline: Date, lead: DeadlineLead, now: Date): "none" | "reminder" | "overdue" {
  const t = deadline.getTime();
  if (t <= now.getTime()) return "overdue";
  if (t - DEADLINE_LEAD_MS[lead] <= now.getTime()) return "reminder";
  return "none";
}

/** Claim a reminder slot. Returns false if it was already sent. */
async function claim(deps: Deps, userId: string, kind: string, ref: string): Promise<boolean> {
  const inserted = await deps.db.insert(reminderSends).values({ userId, kind, ref }).onConflictDoNothing().returning();
  return inserted.length > 0;
}

export async function runWeeklyReminders(deps: Deps, now = deps.now()) {
  const rows = await deps.db
    .select({ userId: users.id, firstName: users.firstName, timezone: userSettings.timezone, orgId: organizations.id, orgName: organizations.name })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .leftJoin(userSettings, eq(userSettings.userId, users.id))
    .where(and(eq(users.isActive, true), isNull(organizations.suspendedAt)));

  let sent = 0;
  for (const row of rows) {
    let parts;
    try {
      parts = zonedParts(now, row.timezone ?? "UTC");
    } catch {
      parts = zonedParts(now, "UTC");
    }
    const due = weeklyReminderDue(parts);
    if (!due) continue;
    const [plan] = await deps.db
      .select()
      .from(weeklyPlans)
      .where(and(eq(weeklyPlans.organizationId, row.orgId), eq(weeklyPlans.userId, row.userId), eq(weeklyPlans.weekStart, parts.monday)));
    const url = `${deps.config.WEB_ORIGIN}/app/${row.orgId}/week`;
    if (due === "weekly-plan" && (!plan || plan.status === "draft")) {
      if (!(await claim(deps, row.userId, "weekly-plan", `${row.orgId}:${parts.monday}`))) continue;
      await deps.notifier.trigger("weekly-plan-reminder", row.userId, {
        firstName: row.firstName,
        organizationName: row.orgName,
        hasDraft: !!plan,
        weekLabel: weekLabel(parts.monday, now),
        url,
      });
      sent++;
    }
    if (due === "week-close" && plan?.status === "approved") {
      if (!(await claim(deps, row.userId, "week-close", `${row.orgId}:${parts.monday}`))) continue;
      await deps.notifier.trigger("week-close-reminder", row.userId, {
        firstName: row.firstName,
        organizationName: row.orgName,
        weekLabel: weekLabel(parts.monday, now),
        url,
      });
      sent++;
    }
  }
  return sent;
}

export async function runDeadlineReminders(deps: Deps, now = deps.now()) {
  // Anything due within the longest lead time, or already past due.
  const horizon = new Date(now.getTime() + DEADLINE_LEAD_MS["3d"]);
  const tasks = await deps.db
    .select({ t: assignedTasks, lead: userSettings.deadlineLead, timezone: userSettings.timezone, orgName: organizations.name })
    .from(assignedTasks)
    .innerJoin(organizations, eq(organizations.id, assignedTasks.organizationId))
    .innerJoin(users, eq(users.id, assignedTasks.assigneeId))
    .leftJoin(userSettings, eq(userSettings.userId, assignedTasks.assigneeId))
    .where(
      and(
        or(eq(assignedTasks.status, "todo"), eq(assignedTasks.status, "in_progress")),
        lte(assignedTasks.deadline, horizon),
        isNull(organizations.suspendedAt),
        eq(users.isActive, true),
      ),
    );

  let sent = 0;
  for (const { t, lead, timezone, orgName } of tasks) {
    const state = deadlineState(t.deadline, (lead ?? "1d") as DeadlineLead, now);
    if (state === "none") continue;
    const ref = `${t.id}:${t.deadline.toISOString()}`;
    const payload = {
      organizationId: t.organizationId,
      organizationName: orgName,
      taskId: t.id,
      taskTitle: t.title,
      deadline: t.deadline.toISOString(),
      timezone: timezone ?? "UTC",
      url: `${deps.config.WEB_ORIGIN}/app/${t.organizationId}/tasks/${t.id}`,
    };
    if (state === "reminder") {
      if (!(await claim(deps, t.assigneeId, "task-deadline", ref))) continue;
      await deps.notifier.trigger("task-deadline-reminder", t.assigneeId, payload);
      sent++;
    } else {
      if (!(await claim(deps, t.assigneeId, "task-overdue", ref))) continue;
      const to = [t.assigneeId, ...(t.assignedById && t.assignedById !== t.assigneeId ? [t.assignedById] : [])];
      await deps.notifier.trigger("task-overdue", to, payload);
      sent++;
    }
  }
  return sent;
}

export async function runReminders(deps: Deps) {
  const weekly = await runWeeklyReminders(deps);
  const deadlines = await runDeadlineReminders(deps);
  if (weekly || deadlines) logger.info({ weekly, deadlines }, "Reminders sent");
}

export function scheduleReminders(deps: Deps) {
  let running = false;
  return cron.schedule("*/15 * * * *", async () => {
    if (running) return;
    running = true;
    try {
      await runReminders(deps);
    } catch (err) {
      logger.error({ err }, "Reminder run failed");
    } finally {
      running = false;
    }
  });
}

export { inArray };
