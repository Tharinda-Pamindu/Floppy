"use client";

import type { AssignedTask } from "@floppy/shared";
import { CircleDot, GitBranch, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use } from "react";
import { useOrgContext } from "@/components/app-shell";
import { AssignTaskDialog } from "@/components/tasks/assign-dialog";
import { DeadlineText, PriorityBadge, TaskStatusBadge } from "@/components/tasks/task-bits";
import { Button } from "@/components/ui/button";
import { Avatar, Tabs, TabsList, TabsTrigger } from "@/components/ui/misc";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { useMyTasks } from "@/lib/queries";
import { fullName } from "@/lib/utils";

type Scope = "mine" | "assigned_by_me" | "team";

function TaskList({ orgId }: { orgId: string }) {
  const org = useOrgContext();
  const router = useRouter();
  const params = useSearchParams();
  const canAssign = org.role === "owner" || org.role === "admin" || org.isLead;
  const scope = (params.get("scope") as Scope) ?? "mine";
  const tasks = useMyTasks(orgId, scope);
  const open = (tasks.data ?? []).filter((t) => t.status === "todo" || t.status === "in_progress");
  const closed = (tasks.data ?? []).filter((t) => !open.includes(t));

  return (
    <>
      <PageHeader
        title="Tasks"
        description="Work assigned with a deadline. Pull a task into your weekly plan to commit to it."
        actions={canAssign ? <AssignTaskDialog orgId={orgId} trigger={<Button><Plus className="h-4 w-4" />Assign a task</Button>} /> : undefined}
      />
      <Tabs value={scope} onValueChange={(v) => router.replace(`/app/${orgId}/tasks?scope=${v}`)}>
        <TabsList>
          <TabsTrigger value="mine">Assigned to me</TabsTrigger>
          {canAssign && <TabsTrigger value="assigned_by_me">Assigned by me</TabsTrigger>}
          {canAssign && <TabsTrigger value="team">My teams</TabsTrigger>}
        </TabsList>
      </Tabs>
      {tasks.isLoading ? (
        <PageLoader />
      ) : tasks.error ? (
        <ErrorState error={tasks.error} onRetry={() => tasks.refetch()} />
      ) : !tasks.data?.length ? (
        <EmptyState icon={<CircleDot className="h-6 w-6" />} title={scope === "mine" ? "Nothing assigned to you" : "No tasks here yet"}>
          {scope === "mine" ? "When a lead assigns you work, it shows up here and in your notifications." : "Assign a task from a team's People or Repositories tab, or with the button above."}
        </EmptyState>
      ) : (
        <div className="space-y-8">
          <TaskGroup orgId={orgId} title="Open" tasks={open} showAssignee={scope !== "mine"} />
          {closed.length > 0 && <TaskGroup orgId={orgId} title="Closed" tasks={closed} showAssignee={scope !== "mine"} />}
        </div>
      )}
    </>
  );
}

function TaskGroup({ orgId, title, tasks, showAssignee }: { orgId: string; title: string; tasks: AssignedTask[]; showAssignee: boolean }) {
  if (!tasks.length) return null;
  return (
    <section>
      <h2 className="mb-2 font-mono text-xs font-bold tracking-widest text-muted uppercase">{title} · {tasks.length}</h2>
      <ul className="label-card-flat divide-y-2 divide-rule-soft">
        {tasks.map((t) => (
          <li key={t.id}>
            <Link href={`/app/${orgId}/tasks/${t.id}`} className="flex flex-col gap-2 px-4 py-3 hover:bg-surface-2/60 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 font-semibold">
                  <span className="truncate">{t.title}</span>
                  {t.github && <span className="inline-flex shrink-0 items-center gap-1 font-mono text-xs text-muted"><GitBranch className="h-3 w-3" />#{t.github.number}</span>}
                </div>
                <div className="mt-0.5 text-xs"><DeadlineText task={t} />{t.teamName && <span className="text-muted"> · {t.teamName}</span>}{t.planLink && <span className="text-accent"> · in your plan</span>}</div>
              </div>
              <div className="flex items-center gap-2">
                {showAssignee && <span className="flex items-center gap-1.5 text-xs"><Avatar person={t.assignee} size={22} />{fullName(t.assignee)}</span>}
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

export default function TasksPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  return (
    <Suspense fallback={<PageLoader />}>
      <TaskList orgId={orgId} />
    </Suspense>
  );
}
