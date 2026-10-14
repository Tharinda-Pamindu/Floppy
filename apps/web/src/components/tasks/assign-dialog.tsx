"use client";

import type { AssignedTask, GithubIssue, PersonRef, Priority } from "@floppy/shared";
import { LIMITS, PRIORITIES } from "@floppy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CircleDot } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useOrgContext } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { keys, useMe, useTeams } from "@/lib/queries";
import { fullName, toLocalInput } from "@/lib/utils";

function defaultDeadline() {
  const d = new Date();
  d.setDate(d.getDate() + 3);
  d.setHours(17, 0, 0, 0);
  return toLocalInput(d.toISOString());
}

/**
 * Assign a task. Shown only to people who may assign: owners/admins (anyone)
 * and team leads (members of teams they lead). The API enforces the same rule.
 */
export function AssignTaskDialog({
  orgId,
  assignee,
  members,
  teamId,
  github,
  trigger,
}: {
  orgId: string;
  assignee?: PersonRef;
  members?: PersonRef[];
  teamId?: string;
  github?: { repoId: string; issue: GithubIssue };
  trigger?: React.ReactNode;
}) {
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const org = useOrgContext();
  const me = useMe();
  const teams = useTeams(orgId);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(github ? github.issue.title.slice(0, LIMITS.taskTitleMax) : "");
  const [description, setDescription] = useState(github ? `GitHub issue #${github.issue.number}: ${github.issue.url}` : "");
  const [assigneeId, setAssigneeId] = useState(assignee?.id ?? "");
  const [deadline, setDeadline] = useState(defaultDeadline);
  const [priority, setPriority] = useState<Priority>("normal");

  const create = useMutation({
    mutationFn: () =>
      api<AssignedTask>(`/organizations/${orgId}/tasks`, {
        method: "POST",
        json: {
          title,
          description,
          assigneeId,
          teamId: teamId ?? null,
          deadline: new Date(deadline).toISOString(),
          priority,
          ...(github ? { githubRepoId: github.repoId, githubIssueNumber: github.issue.number } : {}),
        },
      }),
    onSuccess: (task) => {
      void queryClient.invalidateQueries({ queryKey: keys.tasks(orgId) });
      void queryClient.invalidateQueries({ queryKey: ["org", orgId, "teams"] });
      toast.ok(`Assigned to ${fullName(task.assignee)}. They've been emailed.`);
      setOpen(false);
      router.push(`/app/${orgId}/tasks/${task.id}`);
    },
  });

  const isManager = org.role === "owner" || org.role === "admin";
  const ledTeams = (teams.data ?? []).filter((t) => t.lead?.id === me.data?.id);
  const leadsThisTeam = teamId ? ledTeams.some((t) => t.id === teamId) : ledTeams.length > 0;
  if (!isManager && !leadsThisTeam) return null;
  if (assignee && assignee.id === me.data?.id && !isManager) return null;

  // Who can be picked: the given list, or members of teams this person leads (managers: everyone in those teams).
  const pool: PersonRef[] = assignee
    ? [assignee]
    : members ?? (isManager ? (teams.data ?? []).flatMap((t) => t.members) : ledTeams.flatMap((t) => t.members));
  const choices = [...new Map(pool.map((p) => [p.id, p])).values()];

  const ready = title.trim() && assigneeId && deadline;
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title={github ? `Assign issue #${github.issue.number}` : assignee ? `Assign a task to ${fullName(assignee)}` : "Assign a task"}
      description="The assignee gets an email and an in-app notification, and reminders before the deadline."
      trigger={trigger ?? <Button size="sm" variant="outline"><CircleDot className="h-3.5 w-3.5" />Assign</Button>}
      footer={<Button onClick={() => create.mutate()} disabled={!ready} loading={create.isPending}>Assign task</Button>}
    >
      <div className="space-y-4">
        <Field label="Task" htmlFor="at-title">
          <Input id="at-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.taskTitleMax} placeholder="A result someone can check" />
        </Field>
        <Field label="Details (optional)" htmlFor="at-desc">
          <Textarea id="at-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.assignedDescriptionMax} />
        </Field>
        {!assignee && (
          <Field label="Assignee" htmlFor="at-who">
            <Select id="at-who" value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
              <option value="">Choose someone…</option>
              {choices.map((p) => <option key={p.id} value={p.id}>{fullName(p)}</option>)}
            </Select>
          </Field>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Deadline" htmlFor="at-deadline" hint="Your local time">
            <Input id="at-deadline" type="datetime-local" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
          </Field>
          <Field label="Priority" htmlFor="at-priority">
            <Select id="at-priority" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}>
              {PRIORITIES.map((p) => <option key={p} value={p}>{p[0]!.toUpperCase() + p.slice(1)}</option>)}
            </Select>
          </Field>
        </div>
        <FormError message={create.error ? errorMessage(create.error) : null} />
      </div>
    </Dialog>
  );
}
