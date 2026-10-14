import type { AssignedTask, AssignedTaskStatus, IssueType } from "@floppy/shared";
import { isOpenTaskStatus } from "@floppy/shared";
import { Bookmark, Bug, CircleCheckBig, type LucideIcon } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { cn, relativeTime } from "@/lib/utils";

export const STATUS_LABEL: Record<AssignedTaskStatus, string> = {
  todo: "To do",
  in_progress: "In progress",
  in_review: "In review",
  done: "Done",
  cancelled: "Cancelled",
};
const statusTone: Record<AssignedTaskStatus, BadgeTone> = {
  todo: "neutral",
  in_progress: "accent",
  in_review: "warn",
  done: "ok",
  cancelled: "ink",
};
const priorityTone: Record<AssignedTask["priority"], BadgeTone> = { low: "neutral", normal: "neutral", high: "warn", urgent: "danger" };

export const TYPE_LABEL: Record<IssueType, string> = { task: "Task", bug: "Bug", story: "Story" };
const typeStyle: Record<IssueType, { Icon: LucideIcon; className: string }> = {
  task: { Icon: CircleCheckBig, className: "bg-accent-soft text-accent" },
  bug: { Icon: Bug, className: "bg-danger-soft text-danger" },
  story: { Icon: Bookmark, className: "bg-ok-soft text-ok" },
};

export function TaskStatusBadge({ status }: { status: AssignedTaskStatus }) {
  return <Badge tone={statusTone[status]}>{STATUS_LABEL[status]}</Badge>;
}

export function PriorityBadge({ priority }: { priority: AssignedTask["priority"] }) {
  return <Badge tone={priorityTone[priority]}>{priority}</Badge>;
}

/** The issue type as a small coloured square icon, like Jira's. */
export function TypeIcon({ type, className }: { type: IssueType; className?: string }) {
  const { Icon, className: tone } = typeStyle[type];
  return (
    <span title={TYPE_LABEL[type]} className={cn("inline-grid h-5 w-5 shrink-0 place-items-center rounded-md", tone, className)}>
      <Icon className="h-3 w-3" strokeWidth={2.5} aria-label={TYPE_LABEL[type]} />
    </span>
  );
}

/** "NORT-42", set in mono so keys line up in lists. */
export function TaskKey({ task, className }: { task: Pick<AssignedTask, "key">; className?: string }) {
  return <span className={cn("shrink-0 font-mono text-xs font-medium text-muted", className)}>{task.key}</span>;
}

export function PointsChip({ points }: { points: number | null }) {
  if (points === null) return null;
  return (
    <span title={`${points} story points`} className="inline-grid h-5 min-w-5 place-items-center rounded-full bg-surface-2 px-1.5 text-[11px] font-semibold text-ink-soft">
      {points}
    </span>
  );
}

export function LabelChips({ labels, className }: { labels: string[]; className?: string }) {
  if (!labels.length) return null;
  return (
    <span className={cn("flex flex-wrap gap-1", className)}>
      {labels.map((l) => (
        <span key={l} className="rounded-full border border-rule px-2 py-px text-[11px] font-medium text-ink-soft">
          {l}
        </span>
      ))}
    </span>
  );
}

export function DeadlineText({ task }: { task: Pick<AssignedTask, "deadline" | "status"> }) {
  const open = isOpenTaskStatus(task.status);
  const overdue = open && new Date(task.deadline).getTime() < Date.now();
  const soon = open && !overdue && new Date(task.deadline).getTime() - Date.now() < 86_400_000;
  return (
    <span className={overdue ? "font-semibold text-danger" : soon ? "font-semibold text-warn" : "text-muted"}>
      {overdue ? "Overdue · " : "Due "}
      {relativeTime(task.deadline)}
    </span>
  );
}
