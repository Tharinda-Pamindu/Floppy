"use client";

import { weekLabel } from "@floppy/shared";
import { ArrowRight, Inbox } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { Avatar } from "@/components/ui/misc";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { useApprovals } from "@/lib/queries";
import { formatDateTime, fullName } from "@/lib/utils";

export default function Approvals({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const approvals = useApprovals(orgId);
  return (
    <>
      <PageHeader title="Approvals" description="Plans waiting for you, oldest first." />
      {approvals.isLoading ? (
        <PageLoader />
      ) : approvals.error ? (
        <ErrorState error={approvals.error} onRetry={() => approvals.refetch()} />
      ) : !approvals.data?.length ? (
        <EmptyState icon={<Inbox className="h-6 w-6" />} title="Nothing waiting for you">
          When someone on a team you lead submits a plan, it shows up here (and in your notifications).
        </EmptyState>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {approvals.data.map((p) => {
            const main = p.tasks.find((t) => t.kind === "main");
            const hours = p.tasks.reduce((n, t) => n + (t.estimateHours ?? 0), 0);
            return (
              <li key={p.id}>
                <Link href={`/app/${orgId}/plans/${p.id}`} className="label-card block p-4 transition-[border-color,box-shadow] hover:border-rule-strong hover:shadow-[var(--shadow-pop)]">
                  <div className="flex items-center gap-3">
                    <Avatar person={p.author} size={36} />
                    <div className="min-w-0">
                      <div className="font-bold">{fullName(p.author)}</div>
                      <div className="font-mono text-xs text-muted">{weekLabel(p.weekStart)} · submitted {formatDateTime(p.submittedAt)}</div>
                    </div>
                    <ArrowRight className="ml-auto h-4 w-4" />
                  </div>
                  <p className="mt-3 font-display text-lg leading-snug font-bold">{main?.title ?? "No main task"}</p>
                  <p className="mt-2 font-mono text-xs text-muted">{p.tasks.length} tasks{hours ? ` · ${hours}h estimated` : ""}</p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
