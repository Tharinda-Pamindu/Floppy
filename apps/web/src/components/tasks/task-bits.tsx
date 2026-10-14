import type { AssignedTask } from "@floppy/shared";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { relativeTime } from "@/lib/utils";

const statusTone: Record<AssignedTask["status"], [string, BadgeTone]> = {
  todo: ["To do", "neutral"],
  in_progress: ["In progress", "accent"],
  done: ["Done", "ok"],
  cancelled: ["Cancelled", "ink"],
};
const priorityTone: Record<AssignedTask["priority"], BadgeTone> = { low: "neutral", normal: "neutral", high: "warn", urgent: "danger" };

export function TaskStatusBadge({ status }: { status: AssignedTask["status"] }) {
  const [label, tone] = statusTone[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function PriorityBadge({ priority }: { priority: AssignedTask["priority"] }) {
  return <Badge tone={priorityTone[priority]}>{priority}</Badge>;
}

export function DeadlineText({ task }: { task: Pick<AssignedTask, "deadline" | "status"> }) {
  const open = task.status === "todo" || task.status === "in_progress";
  const overdue = open && new Date(task.deadline).getTime() < Date.now();
  const soon = open && !overdue && new Date(task.deadline).getTime() - Date.now() < 86_400_000;
  return (
    <span className={overdue ? "font-semibold text-danger" : soon ? "font-semibold text-warn" : "text-muted"}>
      {overdue ? "Overdue · " : "Due "}
      {relativeTime(task.deadline)}
    </span>
  );
}
