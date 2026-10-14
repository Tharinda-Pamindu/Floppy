"use client";

import type { AiDraft, AiFinding, AssignedTask, Plan, TaskInput, TaskKind } from "@floppy/shared";
import { LIMITS } from "@floppy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Check, CircleDot, Lightbulb, ListPlus, Plus, Send, Sparkles, Trash2, Undo2, Wand2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { FormError, Input, Textarea } from "@/components/ui/field";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { keys, useAiStatus } from "@/lib/queries";
import { cn, formatDateTime } from "@/lib/utils";
import { ISSUE_LABELS } from "./status";

interface Row {
  key: string;
  id?: string;
  kind: TaskKind;
  title: string;
  why: string;
  hours: string;
  assignedTaskId: string | null;
}

let seq = 0;
const blank = (kind: TaskKind): Row => ({ key: `new-${++seq}`, kind, title: "", why: "", hours: "", assignedTaskId: null });

function rowsFromPlan(plan: Plan | null): Row[] {
  const rows: Row[] = (plan?.tasks ?? []).map((t) => ({
    key: t.id,
    id: t.id,
    kind: t.kind,
    title: t.title,
    why: t.why ?? "",
    hours: t.estimateHours ? String(t.estimateHours) : "",
    assignedTaskId: t.assignedTaskId,
  }));
  return withBlanks(rows);
}

/** Always one main row and one empty row per list, so there's somewhere to type. */
function withBlanks(rows: Row[]): Row[] {
  const out = [...rows];
  if (!out.some((r) => r.kind === "main")) out.unshift(blank("main"));
  for (const kind of ["sub_goal", "gtm"] as const) {
    const list = out.filter((r) => r.kind === kind);
    if (!list.length || list.at(-1)!.title.trim()) out.push(blank(kind));
  }
  return out;
}

const parseHours = (h: string) => {
  const n = Number(h);
  return Number.isInteger(n) && n >= LIMITS.estimateMin && n <= LIMITS.estimateMax ? n : null;
};

function toInputs(rows: Row[]): TaskInput[] {
  return rows
    .filter((r) => r.title.trim())
    .map((r) => ({
      ...(r.id ? { id: r.id } : {}),
      kind: r.kind,
      title: r.title.trim(),
      why: r.kind === "main" ? r.why.trim() || null : null,
      estimateHours: parseHours(r.hours),
      assignedTaskId: r.assignedTaskId,
    }));
}

export function PlanEditor({ orgId, weekStart, plan, onSaved }: { orgId: string; weekStart: string; plan: Plan | null; onSaved: (plan: Plan) => void }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const ai = useAiStatus();
  const [rows, setRows] = useState<Row[]>(() => rowsFromPlan(plan));
  const [baseline, setBaseline] = useState(() => JSON.stringify(toInputs(rowsFromPlan(plan))));
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [undo, setUndo] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const dirty = JSON.stringify(toInputs(rows)) !== baseline;
  const main = rows.find((r) => r.kind === "main")!;
  const total = rows.reduce((n, r) => n + (parseHours(r.hours) ?? 0), 0);
  const canSubmit = !!main.title.trim() && !!main.why.trim();
  const review = plan?.aiReview ?? null;
  const findings = (review?.findings ?? []).filter((f, i) => !applied.has(`${i}`)).map((f) => ({ f, i: review!.findings.indexOf(f) }));

  const sync = (saved: Plan) => {
    setRows(rowsFromPlan(saved));
    setBaseline(JSON.stringify(toInputs(rowsFromPlan(saved))));
    queryClient.setQueryData(keys.plan(orgId, saved.id), saved);
    void queryClient.invalidateQueries({ queryKey: keys.plans(orgId) });
    onSaved(saved);
  };

  async function save(): Promise<Plan> {
    const tasks = toInputs(rows);
    if (!plan) return api<Plan>(`/organizations/${orgId}/plans`, { method: "POST", json: { weekStart, tasks } });
    if (!dirty) return plan;
    return api<Plan>(`/organizations/${orgId}/plans/${plan.id}`, { method: "PUT", json: { tasks } });
  }

  const saveMutation = useMutation({
    mutationFn: save,
    onSuccess: (saved) => {
      sync(saved);
      setError(null);
      toast.ok("Draft saved.");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const reviewMutation = useMutation({
    mutationFn: async () => {
      const saved = await save();
      return api<Plan>(`/organizations/${orgId}/plans/${saved.id}/ai-review`, { method: "POST" });
    },
    onSuccess: (saved) => {
      setApplied(new Set());
      sync(saved);
      setError(null);
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const submitMutation = useMutation({
    mutationFn: async () => {
      const saved = await save();
      return api<Plan>(`/organizations/${orgId}/plans/${saved.id}/submit`, { method: "POST" });
    },
    onSuccess: (saved) => {
      sync(saved);
      void queryClient.invalidateQueries({ queryKey: keys.approvals(orgId) });
      toast.ok("Submitted. Your lead has been notified.");
    },
    onError: (e) => setError(errorMessage(e)),
  });

  const busy = saveMutation.isPending || reviewMutation.isPending || submitMutation.isPending;

  const update = (key: string, patch: Partial<Row>) => setRows((all) => withBlanks(all.map((r) => (r.key === key ? { ...r, ...patch } : r))));
  const remove = (key: string) => setRows((all) => withBlanks(all.filter((r) => r.key !== key)));

  function applyFinding(f: AiFinding, index: number) {
    setApplied((s) => new Set(s).add(`${index}`));
    if (f.taskId) {
      const row = rows.find((r) => r.id === f.taskId);
      if (row) update(row.key, f.field === "why" ? { why: f.suggestedRewrite } : { title: f.suggestedRewrite });
      return;
    }
    setRows((all) => {
      const empty = all.find((r) => r.kind === f.taskKind && !r.title.trim());
      if (empty) return withBlanks(all.map((r) => (r === empty ? { ...r, title: f.suggestedRewrite } : r)));
      return withBlanks([...all, { ...blank(f.taskKind), title: f.suggestedRewrite }]);
    });
  }

  function fillFromDraft(d: AiDraft) {
    setUndo(rows);
    // Keep existing task ids where kinds line up, so earlier findings still match.
    const existing = { main: rows.filter((r) => r.kind === "main" && r.id), sub_goal: rows.filter((r) => r.kind === "sub_goal" && r.id), gtm: rows.filter((r) => r.kind === "gtm" && r.id) };
    const take = (kind: TaskKind, i: number) => existing[kind][i]?.id;
    const next: Row[] = [
      { ...blank("main"), id: take("main", 0), title: d.mainTask.title, why: d.mainTask.why, hours: d.mainTask.estimateHours ? String(d.mainTask.estimateHours) : "" },
      ...d.subGoals.map((t, i) => ({ ...blank("sub_goal"), id: take("sub_goal", i), title: t.title, hours: t.estimateHours ? String(t.estimateHours) : "" })),
      ...d.gtmGoals.map((t, i) => ({ ...blank("gtm"), id: take("gtm", i), title: t.title, hours: t.estimateHours ? String(t.estimateHours) : "" })),
    ];
    setRows(withBlanks(next.map((r) => ({ ...r, key: r.id ?? r.key }))));
  }

  function addAssigned(t: AssignedTask) {
    setRows((all) => {
      const empty = all.find((r) => r.kind === "sub_goal" && !r.title.trim());
      const row = { title: t.title, assignedTaskId: t.id };
      if (empty) return withBlanks(all.map((r) => (r === empty ? { ...r, ...row } : r)));
      return withBlanks([...all, { ...blank("sub_goal"), ...row }]);
    });
  }

  const findingsFor = (row: Row) => findings.filter(({ f }) => row.id && f.taskId === row.id);
  const newFindings = (kind: TaskKind) => findings.filter(({ f }) => !f.taskId && f.taskKind === kind);

  return (
    <div className="space-y-6">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        {ai.data?.enabled && <BrainDump orgId={orgId} onDraft={fillFromDraft} disabled={busy} />}
        <AssignedPicker orgId={orgId} onPick={addAssigned} taken={new Set(rows.map((r) => r.assignedTaskId).filter(Boolean) as string[])} />
        <div className="ml-auto font-mono text-xs text-muted">{dirty ? "Unsaved changes" : plan ? `Saved ${formatDateTime(plan.updatedAt ?? plan.createdAt)}` : "Not saved yet"}</div>
      </div>

      {undo && (
        <div className="flex items-center justify-between gap-3 rounded-xl border-2 border-accent bg-accent-soft px-4 py-2.5 text-sm">
          <span><Wand2 className="mr-1.5 inline h-4 w-4" />Filled from your notes. Nothing is saved until you save.</span>
          <Button size="sm" variant="outline" onClick={() => { setRows(undo); setUndo(null); }}><Undo2 className="h-3.5 w-3.5" />Undo</Button>
        </div>
      )}

      {review && (
        <div className={cn("label-card-flat p-4", review.verdict === "approve" ? "border-ok" : "border-warn")}>
          <div className="flex flex-wrap items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" />
            <span className="font-display font-bold">AI review</span>
            <Badge tone={review.verdict === "approve" ? "ok" : "warn"}>{review.verdict === "approve" ? "Looks ready" : "Adjust first"}</Badge>
            {(review.isStale || dirty) && <Badge>Plan changed since this review</Badge>}
            <span className="ml-auto font-mono text-[11px] text-muted">{formatDateTime(review.reviewedAt)}</span>
          </div>
          <p className="mt-2 text-sm">{review.summary}</p>
        </div>
      )}

      {/* Main task */}
      <section className="label-card overflow-hidden">
        <div className="border-b-2 border-rule bg-accent-soft px-4 py-2 font-mono text-xs font-bold tracking-widest uppercase">Main · the one thing you&apos;ll ship</div>
        <div className="space-y-3 p-4">
          <div className="flex gap-2">
            <Input aria-label="Main task" placeholder="A result someone can check on Friday, e.g. “Partial refunds live for EU merchants”" value={main.title} maxLength={LIMITS.taskTitleMax} onChange={(e) => update(main.key, { title: e.target.value })} className="font-semibold" />
            <HoursInput value={main.hours} onChange={(hours) => update(main.key, { hours })} label="Main task hours" />
          </div>
          <Textarea aria-label="Why it matters" placeholder="Why it matters: who benefits, or what it unblocks" value={main.why} maxLength={LIMITS.taskWhyMax} onChange={(e) => update(main.key, { why: e.target.value })} className="min-h-20" />
          {main.assignedTaskId && <LinkedNote />}
          {findingsFor(main).map(({ f, i }) => <FindingNote key={i} finding={f} onApply={() => applyFinding(f, i)} />)}
        </div>
      </section>

      {(["sub_goal", "gtm"] as const).map((kind) => (
        <section key={kind} className="label-card-flat overflow-hidden">
          <div className="border-b-2 border-rule-soft px-4 py-2 font-mono text-xs font-bold tracking-widest text-ink-soft uppercase">
            {kind === "sub_goal" ? "Sub-goals · what gets the main task over the line" : "Go-to-market · how users will find out"}
          </div>
          <ul className="divide-y-2 divide-rule-soft">
            {rows.filter((r) => r.kind === kind).map((row) => (
              <li key={row.key} className="space-y-2 p-3">
                <div className="flex items-center gap-2">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md border-2 border-rule-soft text-muted">{row.assignedTaskId ? <CircleDot className="h-3.5 w-3.5 text-accent" /> : <Plus className="h-3.5 w-3.5" />}</span>
                  <Input aria-label={kind === "sub_goal" ? "Sub-goal" : "Go-to-market goal"} placeholder={kind === "sub_goal" ? "Add a sub-goal" : "Add a go-to-market goal"} value={row.title} maxLength={LIMITS.taskTitleMax} onChange={(e) => update(row.key, { title: e.target.value })} className="h-10" />
                  <HoursInput value={row.hours} onChange={(hours) => update(row.key, { hours })} label="Hours" />
                  {row.title.trim() && (
                    <Button variant="ghost" size="icon-sm" aria-label="Remove task" onClick={() => remove(row.key)}><Trash2 className="h-4 w-4" /></Button>
                  )}
                </div>
                {row.assignedTaskId && <LinkedNote />}
                {findingsFor(row).map(({ f, i }) => <FindingNote key={i} finding={f} onApply={() => applyFinding(f, i)} />)}
              </li>
            ))}
          </ul>
          {newFindings(kind).map(({ f, i }) => (
            <div key={i} className="border-t-2 border-rule-soft p-3"><FindingNote finding={f} onApply={() => applyFinding(f, i)} applyLabel="Add this task" /></div>
          ))}
        </section>
      ))}

      <div className={cn("flex items-center gap-2 font-mono text-sm", total > LIMITS.capacityHours ? "text-warn" : "text-muted")}>
        {total > LIMITS.capacityHours && <AlertTriangle className="h-4 w-4" />}
        Estimated {total}h{total > LIMITS.capacityHours ? ` — more than a focused week (~${LIMITS.capacityHours}h). Cut something.` : ` of ~${LIMITS.capacityHours}h`}
      </div>

      <FormError message={error} />

      <div className="sticky bottom-20 z-10 flex flex-wrap items-center gap-2 rounded-2xl border-2 border-rule bg-surface p-3 shadow-[var(--shadow-label)] md:bottom-4">
        <Button variant="outline" onClick={() => saveMutation.mutate()} loading={saveMutation.isPending} disabled={busy || (!dirty && !!plan)}>
          {plan ? "Save draft" : "Create draft"}
        </Button>
        {ai.data?.enabled && (
          <Button variant="soft" onClick={() => reviewMutation.mutate()} loading={reviewMutation.isPending} disabled={busy || !rows.some((r) => r.title.trim())}>
            <Sparkles className="h-4 w-4" /> Review with AI
          </Button>
        )}
        <Button className="ml-auto" onClick={() => submitMutation.mutate()} loading={submitMutation.isPending} disabled={busy || !canSubmit}>
          <Send className="h-4 w-4" /> Submit for approval
        </Button>
        {!canSubmit && <p className="w-full text-xs text-muted">To submit, give the main task a title and say why it matters.</p>}
      </div>
    </div>
  );
}

function HoursInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <div className="relative w-20 shrink-0">
      <Input aria-label={label} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value.replace(/\D/g, "").slice(0, 2))} placeholder="—" className="h-10 pr-6 text-right font-mono" />
      <span className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 font-mono text-xs text-muted">h</span>
    </div>
  );
}

function LinkedNote() {
  return <p className="flex items-center gap-1.5 pl-8 text-xs text-accent"><CircleDot className="h-3 w-3" />Linked to an assigned task: ticking it completes the assignment.</p>;
}

/** An AI finding shown in the margin of the task it's about. */
function FindingNote({ finding, onApply, applyLabel = "Apply" }: { finding: AiFinding; onApply: () => void; applyLabel?: string }) {
  return (
    <div className={cn("ml-0 rounded-xl border-2 border-dashed p-3 sm:ml-8", finding.severity === "must_fix" ? "border-warn bg-warn-soft/50" : "border-rule-soft bg-surface-2/40")}>
      <div className="flex flex-wrap items-center gap-2">
        <Lightbulb className={cn("h-4 w-4", finding.severity === "must_fix" ? "text-warn" : "text-muted")} />
        <Badge tone={finding.severity === "must_fix" ? "warn" : "neutral"}>{ISSUE_LABELS[finding.issue] ?? finding.issue}</Badge>
        <span className="text-xs text-muted">{finding.severity === "must_fix" ? "Fix before submitting" : "Suggestion"}</span>
      </div>
      <p className="mt-1.5 text-sm">{finding.problem}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center">
        <p className="flex-1 rounded-lg bg-accent-soft px-2.5 py-1.5 text-sm">{finding.suggestedRewrite}</p>
        <Button size="sm" variant="outline" onClick={onApply}><Check className="h-3.5 w-3.5" />{applyLabel}</Button>
      </div>
    </div>
  );
}

function BrainDump({ orgId, onDraft, disabled }: { orgId: string; onDraft: (d: AiDraft) => void; disabled?: boolean }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState("");
  const [leftOut, setLeftOut] = useState<string[]>([]);
  const draft = useMutation({
    mutationFn: () => api<AiDraft>(`/organizations/${orgId}/ai/plan-drafts`, { method: "POST", json: { notes } }),
    onSuccess: (d) => {
      onDraft(d);
      setLeftOut(d.leftOut);
      if (!d.leftOut.length) setOpen(false);
    },
  });
  const tooShort = notes.trim().length < LIMITS.brainDumpMin;
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { setOpen(o); if (!o) setLeftOut([]); }}
      title="Draft from my notes"
      description="Paste whatever is on your mind for the week. The AI turns it into a plan you can edit. Nothing is saved until you save."
      trigger={<Button variant="soft" size="sm" disabled={disabled}><Wand2 className="h-4 w-4" />Draft from notes</Button>}
      footer={
        leftOut.length ? (
          <Button onClick={() => setOpen(false)}>Done</Button>
        ) : (
          <Button onClick={() => draft.mutate()} loading={draft.isPending} disabled={tooShort}><Sparkles className="h-4 w-4" />Draft my plan</Button>
        )
      }
    >
      {leftOut.length ? (
        <div className="space-y-2 text-sm">
          <p className="font-semibold">Your plan is filled in. These didn&apos;t fit this week:</p>
          <ul className="list-disc space-y-1 pl-5 text-ink-soft">{leftOut.map((l) => <li key={l}>{l}</li>)}</ul>
        </div>
      ) : (
        <div className="space-y-2">
          <Textarea aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={LIMITS.brainDumpMax} className="min-h-48" placeholder="webhooks double-charging some EU cards, need to fix before the launch… also changelog, and the office move…" />
          <div className="flex justify-between font-mono text-xs text-muted"><span>{tooShort ? `At least ${LIMITS.brainDumpMin} characters` : " "}</span><span>{notes.length}/{LIMITS.brainDumpMax}</span></div>
          <FormError message={draft.error ? errorMessage(draft.error) : null} />
        </div>
      )}
    </Dialog>
  );
}

function AssignedPicker({ orgId, onPick, taken }: { orgId: string; onPick: (t: AssignedTask) => void; taken: Set<string> }) {
  const api = useApi();
  const [open, setOpen] = useState(false);
  const tasks = useQuery({
    queryKey: [...keys.tasks(orgId), "open-for-plan"],
    queryFn: () => api<AssignedTask[]>(`/organizations/${orgId}/plans/open-assigned-tasks`),
    enabled: open,
  });
  const available = useMemo(() => (tasks.data ?? []).filter((t) => !taken.has(t.id) && !t.planLink), [tasks.data, taken]);
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="Add from my assigned tasks"
      description="Pick work that was assigned to you. It becomes a sub-goal, and ticking it off completes the assignment."
      trigger={<Button variant="outline" size="sm"><ListPlus className="h-4 w-4" />Add assigned task</Button>}
    >
      {tasks.isLoading ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : available.length === 0 ? (
        <p className="text-sm text-muted">Nothing open is assigned to you right now.</p>
      ) : (
        <ul className="space-y-2">
          {available.map((t) => (
            <li key={t.id}>
              <button onClick={() => { onPick(t); setOpen(false); }} className="flex w-full items-center justify-between gap-3 rounded-xl border-2 border-rule-soft px-3 py-2.5 text-left hover:border-rule">
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{t.title}</span>
                  <span className="text-xs text-muted">Due {formatDateTime(t.deadline)} · {t.priority}</span>
                </span>
                <Plus className="h-4 w-4 shrink-0" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Dialog>
  );
}
