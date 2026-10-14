"use client";

import type { Paginated, Plan } from "@floppy/shared";
import { weekRange } from "@floppy/shared";
import { useQuery } from "@tanstack/react-query";
import { History as HistoryIcon } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { PlanStatusBadge, ShippedBadge } from "@/components/plan/status";
import { Stat, Table, Td, Th } from "@/components/ui/misc";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { useApi } from "@/lib/api";
import { keys } from "@/lib/queries";

export default function HistoryPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const api = useApi();
  const plans = useQuery({ queryKey: [...keys.plans(orgId), "history"], queryFn: () => api<Paginated<Plan>>(`/organizations/${orgId}/plans?limit=52`) });
  const closed = plans.data?.items.filter((p) => p.status === "done") ?? [];
  const shipped = closed.filter((p) => p.mainGoalShipped).length;

  return (
    <>
      <PageHeader title="My past weeks" description="Every plan you've written in this organization." />
      {plans.isLoading ? (
        <PageLoader />
      ) : plans.error ? (
        <ErrorState error={plans.error} onRetry={() => plans.refetch()} />
      ) : !plans.data?.items.length ? (
        <EmptyState icon={<HistoryIcon className="h-6 w-6" />} title="No weeks yet">Your closed weeks will collect here.</EmptyState>
      ) : (
        <div className="space-y-6">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Weeks planned" value={plans.data.total} />
            <Stat label="Closed" value={closed.length} />
            <Stat label="Main task shipped" value={`${shipped}/${closed.length}`} tone="accent" hint={closed.length ? `${Math.round((shipped / closed.length) * 100)}% of closed weeks` : undefined} />
          </div>
          <Table>
            <thead>
              <tr><Th>Week</Th><Th>Main task</Th><Th>Tasks done</Th><Th>Status</Th><Th>Outcome</Th></tr>
            </thead>
            <tbody>
              {plans.data.items.map((p) => (
                <tr key={p.id}>
                  <Td><Link className="font-semibold text-accent hover:underline" href={`/app/${orgId}/plans/${p.id}`}>{weekRange(p.weekStart)}</Link></Td>
                  <Td className="max-w-80 truncate">{p.tasks.find((t) => t.kind === "main")?.title ?? "—"}</Td>
                  <Td className="font-mono">{p.tasks.filter((t) => t.isDone).length}/{p.tasks.length}</Td>
                  <Td><PlanStatusBadge status={p.status} /></Td>
                  <Td><ShippedBadge shipped={p.mainGoalShipped} /></Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </div>
      )}
    </>
  );
}
