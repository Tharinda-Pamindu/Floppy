"use client";

import type { AiUsageByOrg, AiUsageEvent, Paginated } from "@floppy/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { Stat, Table, Td, Th } from "@/components/ui/misc";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { useApi } from "@/lib/api";
import { formatDateTime } from "@/lib/utils";

const REASONS: Record<string, string> = {
  not_configured: "AI not configured",
  local_limit: "Per-user limit",
  provider_rate_limit: "Provider rate limit",
  provider_unreachable: "Provider unreachable",
  timeout: "Timed out",
  invalid_output: "Unusable answer",
  unexpected: "Unexpected error",
};
const reason = (k: string | null) => (k ? (REASONS[k] ?? (k.startsWith("provider_http_") ? `Provider HTTP ${k.slice(14)}` : k)) : "—");

export default function AiUsage() {
  const api = useApi();
  const [days, setDays] = useState(7);
  const [outcome, setOutcome] = useState("");
  const [offset, setOffset] = useState(0);
  const summary = useQuery({ queryKey: ["staff", "ai", days], queryFn: () => api<AiUsageByOrg[]>(`/staff/ai-usage/summary?days=${days}`) });
  const events = useQuery({
    queryKey: ["staff", "ai-events", outcome, offset],
    queryFn: () => api<Paginated<AiUsageEvent>>(`/staff/ai-usage/events?limit=25&offset=${offset}${outcome ? `&outcome=${outcome}` : ""}`),
    placeholderData: keepPreviousData,
  });
  const totals = (summary.data ?? []).reduce((a, r) => ({ calls: a.calls + r.calls, ok: a.ok + r.succeeded, failed: a.failed + r.failed, limited: a.limited + r.rateLimited, tokens: a.tokens + r.inputTokens + r.outputTokens }), { calls: 0, ok: 0, failed: 0, limited: 0, tokens: 0 });

  return (
    <>
      <PageHeader eyebrow="Staff" title="AI usage" description="Every AI call, including failures, is recorded against the organization. Prompts and answers are never stored."
        actions={<Select aria-label="Period" value={days} onChange={(e) => setDays(Number(e.target.value))} className="w-40"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></Select>} />
      {summary.isLoading ? <PageLoader /> : summary.error ? <ErrorState error={summary.error} onRetry={() => summary.refetch()} /> : !summary.data?.length ? (
        <EmptyState title="No AI calls in this period">AI is on hold until an AI_API_KEY is configured on the API.</EmptyState>
      ) : (
        <>
          <div className="mb-6 grid gap-3 sm:grid-cols-4">
            <Stat label="Calls" value={totals.calls} hint={`${totals.tokens.toLocaleString()} tokens`} />
            <Stat label="Succeeded" value={totals.ok} tone="accent" />
            <Stat label="Failed" value={totals.failed} tone={totals.failed ? "danger" : undefined} />
            <Stat label="Rate-limited" value={totals.limited} tone={totals.limited ? "warn" : undefined} />
          </div>
          <Table>
            <thead><tr><Th>Organization</Th><Th>Calls</Th><Th>OK</Th><Th>Failed</Th><Th>Limited</Th><Th>Tokens</Th><Th>Last call</Th></tr></thead>
            <tbody>
              {summary.data.map((r) => (
                <tr key={r.organizationId}>
                  <Td><Link href={`/staff/organizations/${r.organizationId}`} className="font-semibold text-accent hover:underline">{r.organizationName}</Link></Td>
                  <Td className="font-mono">{r.calls}</Td><Td className="font-mono">{r.succeeded}</Td><Td className="font-mono">{r.failed}</Td><Td className="font-mono">{r.rateLimited}</Td>
                  <Td className="font-mono">{(r.inputTokens + r.outputTokens).toLocaleString()}</Td><Td>{formatDateTime(r.lastCallAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </>
      )}

      <div className="mt-10 mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Calls</h2>
        <Select aria-label="Outcome" value={outcome} onChange={(e) => { setOutcome(e.target.value); setOffset(0); }} className="w-44">
          <option value="">All outcomes</option><option value="succeeded">Succeeded</option><option value="failed">Failed</option><option value="rate_limited">Rate-limited</option>
        </Select>
      </div>
      {events.error ? <ErrorState error={events.error} onRetry={() => events.refetch()} /> : (
        <>
          <Table>
            <thead><tr><Th>When</Th><Th>Organization</Th><Th>Feature</Th><Th>Outcome</Th><Th>Reason</Th><Th>Latency</Th></tr></thead>
            <tbody>
              {events.data?.items.map((e) => (
                <tr key={e.id}>
                  <Td>{formatDateTime(e.createdAt)}</Td>
                  <Td>{e.organizationName}</Td>
                  <Td>{e.operation === "plan_review" ? "Plan review" : "Draft from notes"}</Td>
                  <Td><Badge tone={e.outcome === "succeeded" ? "ok" : e.outcome === "failed" ? "danger" : "warn"}>{e.outcome}</Badge></Td>
                  <Td>{reason(e.errorKind)}</Td>
                  <Td className="font-mono">{e.latencyMs} ms</Td>
                </tr>
              ))}
            </tbody>
          </Table>
          {events.data && (
            <div className="mt-3 flex justify-end gap-2">
              <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - 25))}>Previous</Button>
              <Button size="sm" variant="outline" disabled={offset + 25 >= events.data.total} onClick={() => setOffset(offset + 25)}>Next</Button>
            </div>
          )}
        </>
      )}
    </>
  );
}
