"use client";

import type { AiUsageByOrg } from "@floppy/shared";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Stat, Table, Td, Th } from "@/components/ui/misc";
import { ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { useApi } from "@/lib/api";

interface Overview {
  organizations: number;
  suspendedOrganizations: number;
  customers: number;
  deactivatedUsers: number;
  ai7d: { calls: number; failed: number; tokens: number; topOrganizations: AiUsageByOrg[] };
}

export default function StaffOverview() {
  const api = useApi();
  const o = useQuery({ queryKey: ["staff", "overview"], queryFn: () => api<Overview>("/staff/overview") });
  if (o.isLoading) return <PageLoader />;
  if (o.error || !o.data) return <ErrorState error={o.error} onRetry={() => o.refetch()} />;
  const d = o.data;
  const failureRate = d.ai7d.calls ? Math.round((d.ai7d.failed / d.ai7d.calls) * 100) : 0;
  return (
    <>
      <PageHeader eyebrow="Staff" title="Overview" />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Organizations" value={d.organizations} hint={<Link href="/staff/organizations?status=suspended" className="text-warn hover:underline">{d.suspendedOrganizations} suspended</Link>} />
        <Stat label="Customer accounts" value={d.customers} hint={`${d.deactivatedUsers} deactivated`} />
        <Stat label="AI calls · 7 days" value={d.ai7d.calls} hint={`${d.ai7d.tokens.toLocaleString()} tokens`} />
        <Stat label="AI failure rate" value={`${failureRate}%`} tone={failureRate > 20 ? "warn" : undefined} hint="failed + rate-limited" />
      </div>
      <h2 className="mt-8 mb-3 font-display text-lg font-bold">Top AI users · 7 days</h2>
      {d.ai7d.topOrganizations.length ? (
        <Table>
          <thead><tr><Th>Organization</Th><Th>Calls</Th><Th>Failed</Th><Th>Rate-limited</Th></tr></thead>
          <tbody>
            {d.ai7d.topOrganizations.map((r) => (
              <tr key={r.organizationId}>
                <Td><Link className="font-semibold text-accent hover:underline" href={`/staff/organizations/${r.organizationId}`}>{r.organizationName}</Link></Td>
                <Td className="font-mono">{r.calls}</Td><Td className="font-mono">{r.failed}</Td><Td className="font-mono">{r.rateLimited}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      ) : <p className="text-sm text-muted">No AI calls in the last 7 days.</p>}
    </>
  );
}
