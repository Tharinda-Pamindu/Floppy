"use client";

import type { AssignedTask, AssignedTaskStatus, Priority } from "@floppy/shared";
import { addWeeks, LIMITS, mondayOf, PRIORITIES, weekLabel } from "@floppy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, CircleCheck, ExternalLink, GitBranch, Pencil, Play, XCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { ThreadFor } from "@/components/chat/thread";
import { DeadlineText, PriorityBadge, TaskStatusBadge } from "@/components/tasks/task-bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { keys, useMembers } from "@/lib/queries";
import { formatDateTime, fullName, toLocalInput } from "@/lib/utils";

export default function TaskPage({ params }: { params: Promise<{ orgId: string; taskId: string }> }) {
  const { orgId, taskId } = use(params);
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const task = useQuery({ queryKey: [...keys.tasks(orgId), taskId], queryFn: () => api<AssignedTask>(`/organizations/${orgId}/tasks/${taskId}`), retry: false });

  const setStatus = useMutation({
    mutationFn: (status: AssignedTaskStatus) => api<AssignedTask | undefined>(`/organizations/${orgId}/tasks/${taskId}`, { method: "PATCH", json: { status } }),
    onSuccess: (t) => {
      void queryClient.invalidateQueries({ queryKey: keys.tasks(orgId) });
      void queryClient.invalidateQueries({ queryKey: keys.plans(orgId) });
      if (t) toast.ok(`Marked ${t.status.replace("_", " ")}.`);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (task.isLoading) return <PageLoader />;
  if (task.error || !task.data) return <ErrorState error={task.error} onRetry={() => task.refetch()} notFound="This task doesn't exist, or it isn't yours to see." />;
  const t = task.data;
  const open = t.status === "todo" || t.status === "in_progress";

  return (
    <>
      <PageHeader
        eyebrow={t.teamName ? `Task · ${t.teamName}` : "Task"}
        title={t.title}
        actions={
          <>
            {t.permissions.changeStatus && t.status === "todo" && <Button variant="outline" onClick={() => setStatus.mutate("in_progress")}><Play className="h-4 w-4" />Start</Button>}
            {t.permissions.changeStatus && open && <Button onClick={() => setStatus.mutate("done")} loading={setStatus.isPending}><CircleCheck className="h-4 w-4" />Mark done</Button>}
            {t.permissions.changeStatus && !open && t.status !== "cancelled" && <Button variant="outline" onClick={() => setStatus.mutate("in_progress")}>Reopen</Button>}
            {t.permissions.pull && <PullIntoPlan orgId={orgId} task={t} onDone={(planWeek) => router.push(`/app/${orgId}/week?week=${planWeek}`)} />}
            {t.permissions.edit && <EditTask orgId={orgId} task={t} />}
          </>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-4">
          <div className="label-card grid gap-4 p-5 sm:grid-cols-2">
            <Info label="Status"><TaskStatusBadge status={t.status} /></Info>
            <Info label="Priority"><PriorityBadge priority={t.priority} /></Info>
            <Info label="Deadline"><div className="font-semibold">{formatDateTime(t.deadline)}</div><div className="text-xs"><DeadlineText task={t} /></div></Info>
            <Info label="Assignee"><span className="flex items-center gap-2"><Avatar person={t.assignee} size={24} />{fullName(t.assignee)}</span></Info>
            <Info label="Assigned by"><span className="flex items-center gap-2"><Avatar person={t.assignedBy} size={24} />{fullName(t.assignedBy)}</span></Info>
            {t.planLink && (
              <Info label="In plan"><Link className="font-semibold text-accent hover:underline" href={`/app/${orgId}/plans/${t.planLink.planId}`}>{weekLabel(t.planLink.weekStart)}</Link></Info>
            )}
          </div>
          {t.github && (
            <div className="label-card-flat flex flex-wrap items-center gap-3 p-4">
              <GitBranch className="h-5 w-5" />
              <div className="min-w-0 flex-1">
                <div className="font-mono text-xs text-muted">{t.github.repoFullName}#{t.github.number}</div>
                <div className="truncate font-semibold">{t.github.title ?? "GitHub issue"}</div>
              </div>
              {t.github.state && <Badge tone={t.github.state === "open" ? "ok" : "ink"}>{t.github.state}</Badge>}
              <Button asChild size="sm" variant="outline"><a href={t.github.url} target="_blank" rel="noopener noreferrer">Open on GitHub <ExternalLink className="h-3.5 w-3.5" /></a></Button>
            </div>
          )}
          {t.description && (
            <div className="label-card-flat p-4">
              <h2 className="mb-2 font-mono text-xs font-bold tracking-widest text-muted uppercase">Details</h2>
              <p className="text-sm whitespace-pre-wrap">{t.description}</p>
            </div>
          )}
          {t.permissions.edit && open && (
            <Button variant="ghost" className="text-danger" onClick={() => setStatus.mutate("cancelled")}><XCircle className="h-4 w-4" />Cancel this task</Button>
          )}
        </div>
        <aside className="label-card-flat h-fit overflow-hidden">
          <ThreadFor orgId={orgId} path={`/organizations/${orgId}/tasks/${t.id}/conversation`} title="Discussion" compact />
        </aside>
      </div>
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 font-mono text-[11px] font-bold tracking-widest text-muted uppercase">{label}</div>
      <div className="text-sm">{children}</div>
    </div>
  );
}

function PullIntoPlan({ orgId, task, onDone }: { orgId: string; task: AssignedTask; onDone: (week: string) => void }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const current = mondayOf(new Date());
  const [open, setOpen] = useState(false);
  const [week, setWeek] = useState(current);
  const [kind, setKind] = useState<"sub_goal" | "main">("sub_goal");
  const pull = useMutation({
    mutationFn: () => api<{ planId: string; weekStart: string }>(`/organizations/${orgId}/tasks/${task.id}/pull-into-plan`, { method: "POST", json: { weekStart: week, kind } }),
    onSuccess: (r) => {
      void queryClient.invalidateQueries({ queryKey: keys.tasks(orgId) });
      void queryClient.invalidateQueries({ queryKey: keys.plans(orgId) });
      toast.ok("Added to your plan.");
      setOpen(false);
      onDone(r.weekStart);
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Add to my weekly plan" description="Ticking it off in your plan completes this task." trigger={<Button variant="soft"><CalendarPlus className="h-4 w-4" />Add to my plan</Button>}
      footer={<Button onClick={() => pull.mutate()} loading={pull.isPending}>Add to plan</Button>}>
      <div className="space-y-4">
        <Field label="Week" htmlFor="pull-week">
          <Select id="pull-week" value={week} onChange={(e) => setWeek(e.target.value)}>
            {[current, addWeeks(current, 1)].map((w) => <option key={w} value={w}>{weekLabel(w)}</option>)}
          </Select>
        </Field>
        <Field label="As" htmlFor="pull-kind">
          <Select id="pull-kind" value={kind} onChange={(e) => setKind(e.target.value as "sub_goal" | "main")}>
            <option value="sub_goal">A sub-goal</option>
            <option value="main">The main task</option>
          </Select>
        </Field>
        <FormError message={pull.error ? errorMessage(pull.error) : null} />
      </div>
    </Dialog>
  );
}

function EditTask({ orgId, task }: { orgId: string; task: AssignedTask }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const members = useMembers(orgId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  const [deadline, setDeadline] = useState(toLocalInput(task.deadline));
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [assigneeId, setAssigneeId] = useState(task.assignee.id);
  const save = useMutation({
    mutationFn: () =>
      api(`/organizations/${orgId}/tasks/${task.id}`, {
        method: "PATCH",
        json: { title, description, deadline: new Date(deadline).toISOString(), priority, ...(assigneeId !== task.assignee.id ? { assigneeId } : {}) },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: keys.tasks(orgId) });
      toast.ok("Task updated. The assignee has been notified.");
      setOpen(false);
    },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Edit task" trigger={<Button variant="outline"><Pencil className="h-4 w-4" />Edit</Button>}
      footer={<Button onClick={() => save.mutate()} loading={save.isPending} disabled={!title.trim()}>Save</Button>}>
      <div className="space-y-4">
        <Field label="Task" htmlFor="et-title"><Input id="et-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.taskTitleMax} /></Field>
        <Field label="Details" htmlFor="et-desc"><Textarea id="et-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.assignedDescriptionMax} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Deadline" htmlFor="et-deadline"><Input id="et-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} /></Field>
          <Field label="Priority" htmlFor="et-priority">
            <Select id="et-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>{PRIORITIES.map((p) => <option key={p} value={p}>{p}</option>)}</Select>
          </Field>
        </div>
        <Field label="Assignee" htmlFor="et-assignee" hint="Reassigning emails the new assignee.">
          <Select id="et-assignee" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
            {(members.data ?? [task.assignee]).map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}
          </Select>
        </Field>
        <FormError message={save.error ? errorMessage(save.error) : null} />
      </div>
    </Dialog>
  );
}
