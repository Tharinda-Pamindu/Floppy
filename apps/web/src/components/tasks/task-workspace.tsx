"use client";

import type { AssignedTask } from "@floppy/shared";
import { isOpenTaskStatus } from "@floppy/shared";
import { CalendarDays, CircleDot, Columns3, GitBranch, List, Plus } from "lucide-react";
import Link from "next/link";
import { useOrgContext } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Avatar, Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { type TaskScope, useTasks } from "@/lib/queries";
import { cn, fullName } from "@/lib/utils";
import { AssignTaskDialog } from "./assign-dialog";
import { DeadlineText, LabelChips, PointsChip, PriorityBadge, TaskKey, TaskStatusBadge, TypeIcon } from "./task-bits";
import { TaskBoard } from "./task-board";
import { monthGrid, monthParam, parseMonth, TaskCalendar } from "./task-calendar";
import { TaskFilterBar, useTaskUrlState } from "./task-filters";

export type TaskView = "list" | "board" | "calendar";

/**
 * Tasks as a list, a board or a calendar, with one filter bar. List and board
 * live at /tasks (?view=board), the calendar at /calendar; scope and filters
 * carry over when switching.
 */
export function TaskWorkspace({ orgId, view }: { orgId: string; view: TaskView }) {
  const org = useOrgContext();
  const { query, params, set } = useTaskUrlState();
  const canAssign = org.role === "owner" || org.role === "admin" || org.isLead;
  const month = parseMonth(params.get("month"));
  const range = view === "calendar" ? monthGrid(month) : null;
  const tasks = useTasks(orgId, {
    ...query,
    ...(range ? { from: range.start.toISOString(), to: range.end.toISOString() } : {}),
  });
  const knownLabels = [...new Set((tasks.data ?? []).flatMap((t) => t.labels))].sort();

  // Switching views keeps scope and filters (but not the calendar's month).
  const carried = new URLSearchParams(params);
  carried.delete("view");
  carried.delete("month");
  const href = (v: TaskView) => {
    const next = new URLSearchParams(carried);
    if (v === "board") next.set("view", "board");
    const base = v === "calendar" ? `/app/${orgId}/calendar` : `/app/${orgId}/tasks`;
    return `${base}${next.size ? `?${next}` : ""}`;
  };

  return (
    <>
      <PageHeader
        title={view === "calendar" ? "Calendar" : "Tasks"}
        description={
          view === "calendar"
            ? "Every deadline on one month. Drag a task to another day to move it."
            : "Work assigned with a deadline. Pull a task into your weekly plan to commit to it."
        }
        actions={canAssign ? <AssignTaskDialog orgId={orgId} trigger={<Button><Plus className="h-4 w-4" />Assign a task</Button>} /> : undefined}
      />
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <Tabs value={query.scope} onValueChange={(v) => set({ scope: v === "mine" ? undefined : v })}>
          <TabsList className="mb-0">
            <TabsTrigger value="mine">Assigned to me</TabsTrigger>
            {canAssign && <TabsTrigger value="assigned_by_me">Assigned by me</TabsTrigger>}
            {canAssign && <TabsTrigger value="team">My teams</TabsTrigger>}
          </TabsList>
        </Tabs>
        <nav aria-label="View" className="inline-flex rounded-full border border-rule bg-surface p-1 shadow-[var(--shadow-card-sm)]">
          {([
            ["list", "List", List],
            ["board", "Board", Columns3],
            ["calendar", "Calendar", CalendarDays],
          ] as const).map(([v, label, Icon]) => (
            <Link
              key={v}
              href={href(v)}
              aria-current={view === v ? "page" : undefined}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12px] font-bold tracking-[0.06em] uppercase transition-colors",
                view === v ? "bg-accent text-accent-ink" : "text-muted hover:text-ink",
              )}
            >
              <Icon className="h-3.5 w-3.5" />{label}
            </Link>
          ))}
        </nav>
      </div>
      <TaskFilterBar orgId={orgId} knownLabels={knownLabels} />

      {tasks.isLoading ? (
        <PageLoader label={view === "calendar" ? "Loading the calendar…" : "Loading tasks…"} />
      ) : tasks.error ? (
        <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} />
      ) : view === "calendar" ? (
        <TaskCalendar orgId={orgId} tasks={tasks.data ?? []} month={month} onMonthChange={(m) => set({ month: monthParam(m) })} />
      ) : !tasks.data?.length ? (
        <NoTasks scope={query.scope} filtered={Object.values({ ...query, scope: undefined }).some(Boolean)} />
      ) : view === "board" ? (
        <TaskBoard orgId={orgId} tasks={tasks.data} />
      ) : (
        <TaskList orgId={orgId} tasks={tasks.data} showAssignee={query.scope !== "mine"} />
      )}
    </>
  );
}

function NoTasks({ scope, filtered }: { scope: TaskScope; filtered: boolean }) {
  if (filtered) {
    return <EmptyState icon={<CircleDot className="h-6 w-6" />} title="No tasks match these filters">Try another search, or clear the filters.</EmptyState>;
  }
  return (
    <EmptyState icon={<CircleDot className="h-6 w-6" />} title={scope === "mine" ? "Nothing assigned to you" : "No tasks here yet"}>
      {scope === "mine" ? "When a lead assigns you work, it shows up here and in your notifications." : "Assign a task from a team's People or Repositories tab, or with the button above."}
    </EmptyState>
  );
}

function TaskList({ orgId, tasks, showAssignee }: { orgId: string; tasks: AssignedTask[]; showAssignee: boolean }) {
  const open = tasks.filter((t) => isOpenTaskStatus(t.status));
  const closed = tasks.filter((t) => !isOpenTaskStatus(t.status));
  return (
    <div className="space-y-8">
      <TaskGroup orgId={orgId} title="Open" tasks={open} showAssignee={showAssignee} />
      <TaskGroup orgId={orgId} title="Closed" tasks={closed} showAssignee={showAssignee} />
    </div>
  );
}

function TaskGroup({ orgId, title, tasks, showAssignee }: { orgId: string; title: string; tasks: AssignedTask[]; showAssignee: boolean }) {
  if (!tasks.length) return null;
  const points = tasks.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
  return (
    <section>
      <h2 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">
        {title} · {tasks.length}{points > 0 && ` · ${points} pts`}
      </h2>
      <ul className="label-card-flat divide-y divide-rule-soft">
        {tasks.map((t) => (
          <li key={t.id}>
            <Link href={`/app/${orgId}/tasks/${t.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-surface-2/60 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-semibold">
                  <TypeIcon type={t.type} />
                  <TaskKey task={t} />
                  <span className="truncate">{t.title}</span>
                  {t.github && <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-muted"><GitBranch className="h-3 w-3" />#{t.github.number}</span>}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                  <DeadlineText task={t} />
                  {t.teamName && <span className="text-muted">· {t.teamName}</span>}
                  {t.planLink && <span className="text-accent">· in your plan</span>}
                  <LabelChips labels={t.labels} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {showAssignee && <span className="flex items-center gap-1.5 text-xs"><Avatar person={t.assignee} size={22} />{fullName(t.assignee)}</span>}
                <PointsChip points={t.storyPoints} />
                <PriorityBadge priority={t.priority} />
                <TaskStatusBadge status={t.status} />
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
