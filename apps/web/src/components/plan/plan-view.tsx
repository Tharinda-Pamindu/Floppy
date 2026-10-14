"use client";

import type { Plan } from "@floppy/shared";
import { LIMITS } from "@floppy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, CircleDot, MessageSquareText, RotateCcw, ThumbsDown, ThumbsUp, Trophy } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { keys } from "@/lib/queries";
import { cn, formatDateTime, fullName } from "@/lib/utils";
import { PlanStatusBadge, ShippedBadge } from "./status";

const hint: Record<Plan["status"], string> = {
  draft: "Still a draft. Only you can see it.",
  submitted: "Waiting for your lead. Withdraw it if you need to change something.",
  approved: "Approved. Tick tasks off as you finish them and close the week on Friday.",
  done: "This week is closed.",
};

export function PlanView({ orgId, plan, onChange }: { orgId: string; plan: Plan; onChange: (p: Plan) => void }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const done = plan.tasks.filter((t) => t.isDone).length;
  const main = plan.tasks.find((t) => t.kind === "main");

  const refresh = (p: Plan) => {
    queryClient.setQueryData(keys.plan(orgId, p.id), p);
    void queryClient.invalidateQueries({ queryKey: keys.plans(orgId) });
    void queryClient.invalidateQueries({ queryKey: keys.approvals(orgId) });
    void queryClient.invalidateQueries({ queryKey: keys.tasks(orgId) });
    onChange(p);
  };

  const tick = useMutation({
    mutationFn: ({ id, isDone }: { id: string; isDone: boolean }) => api<Plan>(`/organizations/${orgId}/plans/${plan.id}/tasks/${id}`, { method: "PATCH", json: { isDone } }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e)),
  });
  const withdraw = useMutation({
    mutationFn: () => api<Plan>(`/organizations/${orgId}/plans/${plan.id}/withdraw`, { method: "POST" }),
    onSuccess: (p) => { refresh(p); toast.ok("Withdrawn. It's a draft again."); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-6">
      <div className="label-card overflow-hidden">
        <div className="flex flex-wrap items-center gap-2 border-b-2 border-rule px-4 py-3">
          <PlanStatusBadge status={plan.status} />
          <ShippedBadge shipped={plan.mainGoalShipped} />
          <span className="font-mono text-xs text-muted">{done}/{plan.tasks.length} tasks done</span>
          <div className="ml-auto flex gap-2">
            {plan.permissions.withdraw && <Button size="sm" variant="outline" onClick={() => withdraw.mutate()} loading={withdraw.isPending}><RotateCcw className="h-3.5 w-3.5" />Withdraw to edit</Button>}
            {plan.permissions.complete && <CloseWeek orgId={orgId} plan={plan} onDone={refresh} />}
          </div>
        </div>
        <div className="px-4 py-3 text-sm text-ink-soft">{hint[plan.status]}</div>
        {plan.outcomeNote && <div className="border-t-2 border-rule-soft px-4 py-3 text-sm"><strong>Outcome:</strong> {plan.outcomeNote}</div>}
        <div className="h-2 bg-surface-2"><div className="h-full bg-accent transition-all" style={{ width: `${plan.tasks.length ? (done / plan.tasks.length) * 100 : 0}%` }} /></div>
      </div>

      {main && (
        <section className="label-card-flat p-4">
          <div className="font-mono text-xs font-bold tracking-widest text-accent uppercase">Main · ship this</div>
          <TaskLine orgId={orgId} plan={plan} task={main} onTick={(isDone) => tick.mutate({ id: main.id, isDone })} big />
          {main.why && <p className="mt-2 pl-9 text-sm text-ink-soft"><strong>Why:</strong> {main.why}</p>}
        </section>
      )}
      {(["sub_goal", "gtm"] as const).map((kind) => {
        const list = plan.tasks.filter((t) => t.kind === kind);
        if (!list.length) return null;
        return (
          <section key={kind} className="label-card-flat p-4">
            <div className="mb-2 font-mono text-xs font-bold tracking-widest text-ink-soft uppercase">{kind === "sub_goal" ? "Sub-goals" : "Go-to-market"}</div>
            <ul className="space-y-1">
              {list.map((t) => <li key={t.id}><TaskLine orgId={orgId} plan={plan} task={t} onTick={(isDone) => tick.mutate({ id: t.id, isDone })} /></li>)}
            </ul>
          </section>
        );
      })}

      {plan.reviews.length > 0 && (
        <section>
          <h3 className="mb-2 font-display font-bold">Review history</h3>
          <ol className="space-y-2">
            {plan.reviews.map((r) => (
              <li key={r.id} className="flex gap-3 rounded-xl border-2 border-rule-soft bg-surface px-3 py-2.5 text-sm">
                {r.action === "approved" ? <ThumbsUp className="mt-0.5 h-4 w-4 text-ok" /> : <MessageSquareText className="mt-0.5 h-4 w-4 text-warn" />}
                <div>
                  <span className="font-semibold">{fullName(r.reviewer)}</span> {r.action === "approved" ? "approved" : "sent it back"} · <span className="font-mono text-xs text-muted">{formatDateTime(r.createdAt)}</span>
                  {r.comment && <p className="mt-1 text-ink-soft">“{r.comment}”</p>}
                </div>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}

function TaskLine({ orgId, plan, task, onTick, big }: { orgId: string; plan: Plan; task: Plan["tasks"][number]; onTick: (v: boolean) => void; big?: boolean }) {
  const can = plan.permissions.tickTasks;
  return (
    <div className="flex items-start gap-3 py-1.5">
      <button
        role="checkbox"
        aria-checked={task.isDone}
        aria-label={task.isDone ? "Mark not done" : "Mark done"}
        disabled={!can}
        onClick={() => onTick(!task.isDone)}
        className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 border-rule transition-colors", task.isDone ? "bg-accent text-accent-ink" : "bg-surface", can ? "cursor-pointer hover:bg-accent-soft" : "cursor-default opacity-70")}
      >
        {task.isDone && <Check className="h-3.5 w-3.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <span className={cn(big ? "font-display text-lg font-bold" : "text-sm font-medium", task.isDone && "text-muted line-through")}>{task.title}</span>
        <span className="ml-2 font-mono text-xs text-muted">{task.estimateHours ? `${task.estimateHours}h` : ""}</span>
        {task.assignedTaskId && (
          <Link href={`/app/${orgId}/tasks/${task.assignedTaskId}`} className="ml-2 inline-flex items-center gap-1 text-xs font-semibold text-accent"><CircleDot className="h-3 w-3" />assigned task</Link>
        )}
      </div>
    </div>
  );
}

function CloseWeek({ orgId, plan, onDone }: { orgId: string; plan: Plan; onDone: (p: Plan) => void }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [shipped, setShipped] = useState<boolean | null>(null);
  const [note, setNote] = useState("");
  const close = useMutation({
    mutationFn: () => api<Plan>(`/organizations/${orgId}/plans/${plan.id}/complete`, { method: "POST", json: { mainGoalShipped: shipped, outcomeNote: note } }),
    onSuccess: (p) => { setOpen(false); onDone(p); },
  });
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Close the week"
      description="Be honest: it's how the team learns what fits in a week."
      trigger={<Button size="sm"><Trophy className="h-3.5 w-3.5" />Close the week</Button>}
      footer={<Button onClick={() => close.mutate()} disabled={shipped === null} loading={close.isPending}>Close week</Button>}
    >
      <fieldset className="space-y-3">
        <legend className="mb-2 text-sm font-semibold">Did your main task ship?</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            [true, "Yes, it shipped", ThumbsUp],
            [false, "No, it didn't", ThumbsDown],
          ].map(([value, label, Icon]) => {
            const I = Icon as typeof ThumbsUp;
            return (
              <button key={String(value)} type="button" aria-pressed={shipped === value} onClick={() => setShipped(value as boolean)} className={cn("flex items-center justify-center gap-2 rounded-xl border-2 px-3 py-3 text-sm font-semibold", shipped === value ? "border-rule bg-accent-soft" : "border-rule-soft")}>
                <I className="h-4 w-4" />{label as string}
              </button>
            );
          })}
        </div>
        <Field label="Note (optional)" htmlFor="outcome-note" hint="What happened? One line is plenty.">
          <Textarea id="outcome-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.outcomeNoteMax} />
        </Field>
        <FormError message={close.error ? errorMessage(close.error) : null} />
      </fieldset>
    </Dialog>
  );
}
