"use client";

import type { AssignedTask } from "@floppy/shared";
import { isOpenTaskStatus } from "@floppy/shared";
import { ChevronLeft, ChevronRight } from "lucide-react";
import Link from "next/link";
import { type DragEvent, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { cn, fullName } from "@/lib/utils";
import { PointsChip, STATUS_LABEL, TaskKey, TypeIcon } from "./task-bits";
import { useUpdateTask } from "./use-update-task";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MAX_CHIPS = 3;

/** yyyy-mm-dd in the viewer's own time zone. */
export function dayKey(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** "2026-10" → 1 Oct 2026, local midnight (today's month if missing or malformed). */
export function parseMonth(value: string | null) {
  const m = /^(\d{4})-(\d{2})$/.exec(value ?? "");
  const now = new Date();
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, 1) : new Date(now.getFullYear(), now.getMonth(), 1);
}
export function monthParam(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/** The six Monday-first weeks the month grid shows: [first day, day after the last]. */
export function monthGrid(month: Date) {
  const start = new Date(month);
  start.setDate(1 - ((month.getDay() + 6) % 7));
  const end = new Date(start);
  end.setDate(start.getDate() + 42);
  return { start, end };
}

/**
 * Month calendar of deadlines. Drag a task to another day to move its deadline
 * (same time of day). Only people who may edit a task can move it. Click a day
 * to list it below, which is also how the calendar reads on a phone.
 */
export function TaskCalendar({
  orgId,
  tasks,
  month,
  onMonthChange,
}: {
  orgId: string;
  tasks: AssignedTask[];
  month: Date;
  onMonthChange: (month: Date) => void;
}) {
  const update = useUpdateTask(orgId);
  const today = dayKey(new Date());
  const [selected, setSelected] = useState<string>(today);
  const [dragging, setDragging] = useState<AssignedTask | null>(null);
  const [over, setOver] = useState<string | null>(null);

  const { start } = monthGrid(month);
  const days = Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
  const byDay = useMemo(() => {
    const map = new Map<string, AssignedTask[]>();
    for (const t of tasks) {
      const k = dayKey(new Date(t.deadline));
      map.set(k, [...(map.get(k) ?? []), t]);
    }
    for (const list of map.values()) list.sort((a, b) => a.deadline.localeCompare(b.deadline));
    return map;
  }, [tasks]);

  const shift = (months: number) => onMonthChange(new Date(month.getFullYear(), month.getMonth() + months, 1));
  const goToday = () => {
    const now = new Date();
    onMonthChange(new Date(now.getFullYear(), now.getMonth(), 1));
    setSelected(today);
  };
  const moveTo = (task: AssignedTask, day: Date) => {
    const old = new Date(task.deadline);
    const next = new Date(day.getFullYear(), day.getMonth(), day.getDate(), old.getHours(), old.getMinutes());
    if (dayKey(next) !== dayKey(old)) update.mutate({ id: task.id, patch: { deadline: next.toISOString() } });
  };
  const selectedDate = days.find((d) => dayKey(d) === selected) ?? new Date(`${selected}T00:00:00`);
  const agenda = byDay.get(selected) ?? [];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="mr-auto font-display text-2xl font-bold tracking-tight">
          {month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}
        </h2>
        <Button variant="outline" size="sm" onClick={goToday}>Today</Button>
        <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
      </div>

      <div className="label-card-flat overflow-hidden">
        <div className="grid grid-cols-7 border-b border-rule bg-surface-2">
          {WEEKDAYS.map((d) => (
            <div key={d} className="px-2 py-2 text-center text-[11px] font-bold tracking-[0.06em] text-muted uppercase">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((d, i) => {
            const k = dayKey(d);
            const list = byDay.get(k) ?? [];
            const inMonth = d.getMonth() === month.getMonth();
            const weekend = i % 7 >= 5;
            const canDrop = !!dragging && dayKey(new Date(dragging.deadline)) !== k;
            const onDragOver = (e: DragEvent) => {
              if (!canDrop) return;
              e.preventDefault();
              e.dataTransfer.dropEffect = "move";
              setOver(k);
            };
            const onDrop = (e: DragEvent) => {
              e.preventDefault();
              setOver(null);
              if (dragging) moveTo(dragging, d);
              setDragging(null);
            };
            return (
              <div
                key={k}
                onDragOver={onDragOver}
                onDragLeave={() => setOver((s) => (s === k ? null : s))}
                onDrop={onDrop}
                onClick={() => setSelected(k)}
                className={cn(
                  "relative min-h-16 cursor-pointer border-r border-b border-rule-soft p-1.5 text-left transition-colors md:min-h-28",
                  i % 7 === 6 && "border-r-0",
                  i >= 35 && "border-b-0",
                  weekend && "bg-surface-2/40",
                  !inMonth && "bg-surface-2/70",
                  selected === k && "bg-accent-soft/60",
                  over === k && "bg-accent-soft ring-2 ring-highlight ring-inset",
                )}
              >
                <button
                  type="button"
                  aria-label={`${d.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}, ${list.length} ${list.length === 1 ? "task" : "tasks"}`}
                  aria-pressed={selected === k}
                  className={cn(
                    "grid h-7 w-7 place-items-center rounded-full text-xs font-semibold",
                    !inMonth && "text-muted",
                    k === today && "bg-accent text-accent-ink",
                  )}
                >
                  {d.getDate()}
                </button>
                {/* Phones: one dot per task. Wider screens: the tasks themselves. */}
                {list.length > 0 && (
                  <div className="mt-1 flex flex-wrap gap-1 md:hidden" aria-hidden>
                    {list.slice(0, 4).map((t) => <span key={t.id} className={cn("h-1.5 w-1.5 rounded-full", dotTone(t))} />)}
                  </div>
                )}
                <ul className="mt-1 hidden space-y-1 md:block">
                  {list.slice(0, MAX_CHIPS).map((t) => (
                    <li key={t.id}>
                      <CalendarChip
                        orgId={orgId}
                        task={t}
                        dragging={dragging?.id === t.id}
                        onDragStart={() => setDragging(t)}
                        onDragEnd={() => {
                          setDragging(null);
                          setOver(null);
                        }}
                      />
                    </li>
                  ))}
                  {list.length > MAX_CHIPS && (
                    <li className="px-1.5 text-[11px] font-semibold text-highlight">+{list.length - MAX_CHIPS} more</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      <section aria-live="polite">
        <h3 className="mb-2 text-xs font-bold tracking-[0.06em] text-muted uppercase">
          {selectedDate.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })} · {agenda.length}
        </h3>
        {agenda.length ? (
          <ul className="label-card-flat divide-y divide-rule-soft">
            {agenda.map((t) => (
              <li key={t.id}>
                <Link href={`/app/${orgId}/tasks/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface-2/60">
                  <TypeIcon type={t.type} />
                  <TaskKey task={t} />
                  <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", t.status === "done" && "text-muted line-through")}>{t.title}</span>
                  <span className="hidden text-xs text-muted sm:inline">{STATUS_LABEL[t.status]}</span>
                  <span className="text-xs text-muted">{new Date(t.deadline).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}</span>
                  <PointsChip points={t.storyPoints} />
                  <span title={fullName(t.assignee)}><Avatar person={t.assignee} size={22} /></span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="rounded-xl border border-dashed border-rule-strong px-4 py-6 text-center text-sm text-muted">Nothing due this day.</p>
        )}
      </section>
    </div>
  );
}

function isOverdue(t: AssignedTask) {
  return isOpenTaskStatus(t.status) && new Date(t.deadline).getTime() < Date.now();
}

function dotTone(t: AssignedTask) {
  if (t.status === "done") return "bg-mint";
  if (isOverdue(t)) return "bg-danger";
  return t.type === "bug" ? "bg-rose" : "bg-highlight";
}

function CalendarChip({
  orgId,
  task: t,
  dragging,
  onDragStart,
  onDragEnd,
}: {
  orgId: string;
  task: AssignedTask;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  const movable = t.permissions.edit && t.status !== "cancelled";
  return (
    <Link
      href={`/app/${orgId}/tasks/${t.id}`}
      onClick={(e) => e.stopPropagation()}
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", t.key);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      title={`${t.key} · ${t.title}${movable ? " (drag to another day to move the deadline)" : ""}`}
      className={cn(
        "flex items-center gap-1.5 rounded-md border border-rule bg-surface px-1.5 py-1 text-[11px] font-medium shadow-[var(--shadow-card-sm)] hover:border-highlight",
        movable && "cursor-grab active:cursor-grabbing",
        isOverdue(t) && "border-l-2 border-l-danger",
        t.status === "done" && "text-muted line-through",
        dragging && "opacity-40",
      )}
    >
      <TypeIcon type={t.type} className="h-4 w-4" />
      <span className="truncate">{t.title}</span>
    </Link>
  );
}
