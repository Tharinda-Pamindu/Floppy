"use client";

import type { Paginated, Plan } from "@floppy/shared";
import { addWeeks, canPlanWeek, isMonday, mondayOf, weekLabel, weekRange } from "@floppy/shared";
import { useQuery } from "@tanstack/react-query";
import { CalendarPlus, ChevronLeft, ChevronRight, MessagesSquare } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useState } from "react";
import { ThreadFor } from "@/components/chat/thread";
import { PlanEditor } from "@/components/plan/plan-editor";
import { PlanView } from "@/components/plan/plan-view";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { useApi } from "@/lib/api";
import { keys } from "@/lib/queries";

function MyWeek({ orgId }: { orgId: string }) {
  const api = useApi();
  const router = useRouter();
  const params = useSearchParams();
  const current = mondayOf(new Date());
  const requested = params.get("week");
  const week = requested && isMonday(requested) ? requested : current;
  const [writing, setWriting] = useState(false);
  const [showThread, setShowThread] = useState(false);

  const plans = useQuery({
    queryKey: [...keys.plans(orgId), "week", week],
    queryFn: () => api<Paginated<Plan>>(`/organizations/${orgId}/plans?weekStart=${week}`),
  });
  const plan = plans.data?.items[0] ?? null;

  const go = (w: string) => {
    setWriting(false);
    router.push(w === current ? `/app/${orgId}/week` : `/app/${orgId}/week?week=${w}`);
  };
  const nextAllowed = canPlanWeek(addWeeks(week, 1)) || addWeeks(week, 1) <= current;

  return (
    <>
      <PageHeader
        eyebrow={weekRange(week)}
        title={weekLabel(week)}
        description="One main thing to ship, why it matters, and how users will hear about it."
        actions={
          <div className="flex items-center gap-1 rounded-full border border-rule bg-surface p-1">
            <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => go(addWeeks(week, -1))}><ChevronLeft className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => go(current)} disabled={week === current}>This week</Button>
            <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => go(addWeeks(week, 1))} disabled={!nextAllowed}><ChevronRight className="h-4 w-4" /></Button>
          </div>
        }
      />

      {plans.isLoading ? (
        <PageLoader />
      ) : plans.error ? (
        <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
      ) : plan ? (
        <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
          <div>
            {plan.permissions.edit ? (
              <PlanEditor key={plan.id + plan.updatedAt} orgId={orgId} weekStart={week} plan={plan} onSaved={() => plans.refetch()} />
            ) : (
              <PlanView orgId={orgId} plan={plan} onChange={() => plans.refetch()} />
            )}
          </div>
          <aside className="space-y-4">
            {plan.reviews.at(-1)?.action === "changes_requested" && plan.status === "draft" && (
              <div className="label-card-flat border-warn bg-warn-soft p-4 text-sm">
                <div className="font-bold text-warn">Sent back by your lead</div>
                <p className="mt-1">“{plan.reviews.at(-1)!.comment}”</p>
              </div>
            )}
            <div className="label-card-flat overflow-hidden">
              <button onClick={() => setShowThread((s) => !s)} className="flex w-full items-center gap-2 px-4 py-3 text-left font-display font-bold" aria-expanded={showThread}>
                <MessagesSquare className="h-4 w-4 text-accent" /> Discussion
                <span className="ml-auto text-xs font-normal text-muted">{plan.status === "draft" ? "Private until submitted" : "With your approvers"}</span>
              </button>
              {showThread && <div className="border-t border-rule-soft"><ThreadFor orgId={orgId} path={`/organizations/${orgId}/plans/${plan.id}/conversation`} compact /></div>}
            </div>
          </aside>
        </div>
      ) : canPlanWeek(week) ? (
        writing ? (
          <PlanEditor orgId={orgId} weekStart={week} plan={null} onSaved={() => plans.refetch()} />
        ) : (
          <EmptyState
            icon={<CalendarPlus className="h-6 w-6" />}
            title="No plan for this week yet"
            action={<Button onClick={() => setWriting(true)}>Write my plan</Button>}
          >
            What&apos;s the one thing you&apos;ll ship? Start a draft — it stays private until you submit it.
          </EmptyState>
        )
      ) : (
        <EmptyState icon={<CalendarPlus className="h-6 w-6" />} title="Nothing planned this week">
          You can plan last week, this week or next week.
        </EmptyState>
      )}
    </>
  );
}

export default function WeekPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  return (
    <Suspense fallback={<PageLoader />}>
      <MyWeek orgId={orgId} />
    </Suspense>
  );
}
