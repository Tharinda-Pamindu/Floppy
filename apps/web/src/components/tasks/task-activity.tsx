"use client";

import type { AssignedTaskStatus, IssueType, TaskEvent } from "@floppy/shared";
import { History } from "lucide-react";
import { Avatar } from "@/components/ui/misc";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { useTaskActivity } from "@/lib/queries";
import { formatDateTime, fullName, relativeTime } from "@/lib/utils";
import { STATUS_LABEL, TYPE_LABEL } from "./task-bits";

/** One history entry as a sentence: "moved it from To do to In progress". */
function describe(e: TaskEvent): string {
  const status = (v: string | null) => (v ? (STATUS_LABEL[v as AssignedTaskStatus] ?? v) : "none");
  const type = (v: string | null) => (v ? (TYPE_LABEL[v as IssueType] ?? v) : "none");
  const date = (v: string | null) => (v ? formatDateTime(v) : "none");
  switch (e.field) {
    case "created":
      return "created the task";
    case "status":
      return `moved it from ${status(e.from)} to ${status(e.to)}`;
    case "assignee":
      return `reassigned it from ${e.from ?? "nobody"} to ${e.to ?? "nobody"}`;
    case "deadline":
      return `moved the deadline from ${date(e.from)} to ${date(e.to)}`;
    case "priority":
      return `changed the priority from ${e.from} to ${e.to}`;
    case "type":
      return `changed the type from ${type(e.from)} to ${type(e.to)}`;
    case "story_points":
      if (!e.to) return "cleared the story points";
      return e.from ? `changed the story points from ${e.from} to ${e.to}` : `set the story points to ${e.to}`;
    case "labels":
      return e.to ? `set the labels to ${e.to}` : "removed all labels";
    case "title":
      return `renamed it to “${e.to}”`;
    case "description":
      return "edited the details";
  }
}

/** The task's history, newest first (Jira's History tab). */
export function TaskActivity({ orgId, taskId }: { orgId: string; taskId: string }) {
  const activity = useTaskActivity(orgId, taskId);
  return (
    <section className="label-card-flat p-4">
      <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold tracking-wider text-muted uppercase">
        <History className="h-3.5 w-3.5" />Activity
      </h2>
      {activity.isLoading ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-5 w-1/2" />
        </div>
      ) : activity.error ? (
        <ErrorState error={activity.error} onRetry={() => activity.refetch()} />
      ) : !activity.data?.length ? (
        <p className="text-sm text-muted">No changes yet.</p>
      ) : (
        <ol className="relative space-y-4 border-l border-rule pl-5">
          {[...activity.data].reverse().map((e) => (
            <li key={e.id} className="relative">
              <span className="absolute top-0.5 -left-[31px]" aria-hidden><Avatar person={e.actor} size={20} /></span>
              <p className="text-sm">
                <span className="font-semibold">{e.actor ? fullName(e.actor) : "Someone"}</span> {describe(e)}
              </p>
              <time dateTime={e.createdAt} title={formatDateTime(e.createdAt)} className="text-xs text-muted">{relativeTime(e.createdAt)}</time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
