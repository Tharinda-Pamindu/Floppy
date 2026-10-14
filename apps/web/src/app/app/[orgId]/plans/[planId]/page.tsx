"use client";

import type { Plan } from "@floppy/shared";
import { LIMITS, weekLabel, weekRange } from "@floppy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ThumbsUp, Undo2 } from "lucide-react";
import { use, useState } from "react";
import { ThreadFor } from "@/components/chat/thread";
import { PlanEditor } from "@/components/plan/plan-editor";
import { PlanView } from "@/components/plan/plan-view";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { keys } from "@/lib/queries";
import { fullName } from "@/lib/utils";

export default function PlanPage({ params }: { params: Promise<{ orgId: string; planId: string }> }) {
  const { orgId, planId } = use(params);
  const api = useApi();
  const plan = useQuery({ queryKey: keys.plan(orgId, planId), queryFn: () => api<Plan>(`/organizations/${orgId}/plans/${planId}`), retry: false });

  if (plan.isLoading) return <PageLoader />;
  if (plan.error || !plan.data) return <ErrorState error={plan.error} onRetry={() => plan.refetch()} notFound="This plan doesn't exist, or it's still a private draft." />;
  const p = plan.data;

  return (
    <>
      <PageHeader
        eyebrow={`${weekLabel(p.weekStart)} · ${weekRange(p.weekStart)}`}
        title={<span className="flex items-center gap-3"><Avatar person={p.author} size={40} />{fullName(p.author)}&apos;s plan</span>}
        actions={p.permissions.review ? <ReviewActions orgId={orgId} plan={p} /> : undefined}
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        {p.permissions.edit ? (
          <PlanEditor orgId={orgId} weekStart={p.weekStart} plan={p} onSaved={() => plan.refetch()} />
        ) : (
          <PlanView orgId={orgId} plan={p} onChange={() => plan.refetch()} />
        )}
        <aside className="label-card-flat h-fit overflow-hidden">
          <ThreadFor orgId={orgId} path={`/organizations/${orgId}/plans/${p.id}/conversation`} title="Discussion" compact />
        </aside>
      </div>
    </>
  );
}

function ReviewActions({ orgId, plan }: { orgId: string; plan: Plan }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"approve" | "back" | null>(null);
  const [comment, setComment] = useState("");
  const decide = useMutation({
    mutationFn: () =>
      api<Plan>(`/organizations/${orgId}/plans/${plan.id}/${mode === "approve" ? "approve" : "request-changes"}`, {
        method: "POST",
        json: { comment: comment.trim() || null },
      }),
    onSuccess: (p) => {
      queryClient.setQueryData(keys.plan(orgId, p.id), p);
      void queryClient.invalidateQueries({ queryKey: keys.approvals(orgId) });
      toast.ok(mode === "approve" ? "Approved. They've been notified." : "Sent back with your comment.");
      setMode(null);
      setComment("");
    },
  });
  const needsComment = mode === "back" && !comment.trim();
  return (
    <>
      <Button variant="outline" onClick={() => setMode("back")}><Undo2 className="h-4 w-4" />Send back</Button>
      <Button onClick={() => setMode("approve")}><ThumbsUp className="h-4 w-4" />Approve</Button>
      <Dialog
        open={mode !== null}
        onOpenChange={(o) => !o && setMode(null)}
        title={mode === "approve" ? "Approve this plan" : "Send it back"}
        description={mode === "approve" ? "Add a note if you like. They'll be told it's approved." : "Say what to change. The plan goes back to draft."}
        footer={<Button variant={mode === "approve" ? "primary" : "ink"} onClick={() => decide.mutate()} loading={decide.isPending} disabled={needsComment}>{mode === "approve" ? "Approve" : "Send back"}</Button>}
      >
        <Field label={mode === "approve" ? "Comment (optional)" : "Comment"} htmlFor="review-comment">
          <Textarea id="review-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={LIMITS.reviewCommentMax} placeholder={mode === "back" ? "e.g. The main task is two weeks of work — pick the slice that ships Friday." : ""} />
        </Field>
        <FormError message={decide.error ? errorMessage(decide.error) : null} />
      </Dialog>
    </>
  );
}
