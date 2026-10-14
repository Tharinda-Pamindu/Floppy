"use client";

import type { AssignedTask, AssignedTaskStatus } from "@floppy/shared";
import { BOARD_STATUSES } from "@floppy/shared";
import { MoreHorizontal } from "lucide-react";
import Link from "next/link";
import { type DragEvent, useState } from "react";
import { Avatar, Menu, MenuItem } from "@/components/ui/misc";
import { cn, fullName } from "@/lib/utils";
import { DeadlineText, LabelChips, PointsChip, PriorityBadge, STATUS_LABEL, TaskKey, TypeIcon } from "./task-bits";
import { useUpdateTask } from "./use-update-task";

const DRAG_TYPE = "application/x-floppy-task";
const columnAccent: Record<(typeof BOARD_STATUSES)[number], string> = {
  todo: "bg-muted",
  in_progress: "bg-accent",
  in_review: "bg-sun",
  done: "bg-mint",
};

/**
 * Jira-style board: a column per status. Drag a card to move it, or use its
 * "…" menu (keyboard and touch). Only people who may change a task's status
 * can move it; cancelled tasks stay off the board.
 */
export function TaskBoard({ orgId, tasks }: { orgId: string; tasks: AssignedTask[] }) {
  const update = useUpdateTask(orgId);
  const [dragging, setDragging] = useState<AssignedTask | null>(null);
  const [over, setOver] = useState<AssignedTaskStatus | null>(null);
  const move = (task: AssignedTask, status: AssignedTaskStatus) => {
    if (task.status !== status) update.mutate({ id: task.id, patch: { status } });
  };
  const cancelled = tasks.filter((t) => t.status === "cancelled").length;

  return (
    <>
      <div className="-mx-4 grid auto-cols-[minmax(17rem,1fr)] grid-flow-col gap-4 overflow-x-auto px-4 pb-4" role="list" aria-label="Board">
        {BOARD_STATUSES.map((status) => {
          const cards = tasks.filter((t) => t.status === status);
          const points = cards.reduce((sum, t) => sum + (t.storyPoints ?? 0), 0);
          const canDrop = !!dragging && dragging.status !== status;
          const onDragOver = (e: DragEvent) => {
            if (!canDrop) return;
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
            setOver(status);
          };
          const onDrop = (e: DragEvent) => {
            e.preventDefault();
            setOver(null);
            if (dragging) move(dragging, status);
            setDragging(null);
          };
          return (
            <section
              key={status}
              role="listitem"
              aria-label={`${STATUS_LABEL[status]}, ${cards.length} tasks`}
              onDragOver={onDragOver}
              onDragLeave={() => setOver((s) => (s === status ? null : s))}
              onDrop={onDrop}
              className={cn(
                "flex min-h-72 flex-col rounded-2xl bg-surface-2 p-2.5 transition-[box-shadow,background-color]",
                over === status && "bg-accent-soft ring-2 ring-highlight",
              )}
            >
              <header className="flex items-center gap-2 px-1.5 pt-1 pb-3">
                <span className={cn("h-2 w-2 rounded-full", columnAccent[status])} aria-hidden />
                <h3 className="text-[12px] font-bold tracking-[0.06em] uppercase">{STATUS_LABEL[status]}</h3>
                <span className="rounded-full bg-surface px-2 text-xs font-semibold text-muted">{cards.length}</span>
                {points > 0 && <span className="ml-auto text-xs font-medium text-muted">{points} pts</span>}
              </header>
              <ul className="flex flex-1 flex-col gap-2">
                {cards.map((t) => (
                  <BoardCard
                    key={t.id}
                    orgId={orgId}
                    task={t}
                    dragging={dragging?.id === t.id}
                    onDragStart={() => setDragging(t)}
                    onDragEnd={() => {
                      setDragging(null);
                      setOver(null);
                    }}
                    onMove={(s) => move(t, s)}
                  />
                ))}
                {!cards.length && (
                  <li className="grid flex-1 place-items-center rounded-xl border border-dashed border-rule-strong px-3 py-8 text-center text-xs text-muted">
                    {canDrop ? "Drop here" : "Nothing here"}
                  </li>
                )}
              </ul>
            </section>
          );
        })}
      </div>
      {cancelled > 0 && <p className="mt-1 text-xs text-muted">{cancelled} cancelled {cancelled === 1 ? "task is" : "tasks are"} hidden from the board.</p>}
    </>
  );
}

function BoardCard({
  orgId,
  task: t,
  dragging,
  onDragStart,
  onDragEnd,
  onMove,
}: {
  orgId: string;
  task: AssignedTask;
  dragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
  onMove: (status: AssignedTaskStatus) => void;
}) {
  const movable = t.permissions.changeStatus;
  return (
    <li
      draggable={movable}
      onDragStart={(e) => {
        e.dataTransfer.setData(DRAG_TYPE, t.id);
        e.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnd={onDragEnd}
      className={cn(
        "label-card group p-3 transition-[opacity,box-shadow] hover:shadow-[var(--shadow-pop)]",
        movable && "cursor-grab active:cursor-grabbing",
        dragging && "opacity-40",
      )}
    >
      <div className="flex items-center gap-2">
        <TypeIcon type={t.type} />
        <TaskKey task={t} />
        {movable && (
          <span className="ml-auto">
            <Menu
              trigger={
                <button type="button" className="rounded-md p-1 text-muted hover:bg-surface-2 hover:text-ink" aria-label={`Move ${t.key}`}>
                  <MoreHorizontal className="h-4 w-4" />
                </button>
              }
            >
              {BOARD_STATUSES.filter((s) => s !== t.status).map((s) => (
                <MenuItem key={s} onSelect={() => onMove(s)}>Move to {STATUS_LABEL[s]}</MenuItem>
              ))}
            </Menu>
          </span>
        )}
      </div>
      <Link href={`/app/${orgId}/tasks/${t.id}`} className="mt-2 line-clamp-2 block text-sm font-semibold hover:text-accent" draggable={false}>
        {t.title}
      </Link>
      <LabelChips labels={t.labels} className="mt-2" />
      <div className="mt-3 flex items-center gap-2 text-xs">
        {(t.priority === "high" || t.priority === "urgent") && <PriorityBadge priority={t.priority} />}
        <PointsChip points={t.storyPoints} />
        <span className="ml-auto truncate"><DeadlineText task={t} /></span>
        <span title={fullName(t.assignee)}><Avatar person={t.assignee} size={22} /></span>
      </div>
    </li>
  );
}
