"use client";

import type { Paginated, StaffOrganization } from "@floppy/shared";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { Table, Td, Th } from "@/components/ui/misc";
import { ErrorState, PageHeader, PageLoader, Skeleton } from "@/components/ui/states";
import { useApi } from "@/lib/api";
import { formatDate, relativeTime } from "@/lib/utils";

const PAGE = 25;

function Orgs() {
  const api = useApi();
  const router = useRouter();
  const params = useSearchParams();
  const status = params.get("status") ?? "";
  const [q, setQ] = useState(params.get("q") ?? "");
  const offset = Number(params.get("offset") ?? 0);
  const set = (next: Record<string, string | number>) => {
    const sp = new URLSearchParams(params);
    for (const [k, v] of Object.entries(next)) {
      if (v === "" || v === 0) sp.delete(k);
      else sp.set(k, String(v));
    }
    router.replace(`/staff/organizations?${sp}`);
  };
  const list = useQuery({
    queryKey: ["staff", "orgs", status, params.get("q"), offset],
    queryFn: () => api<Paginated<StaffOrganization>>(`/staff/organizations?limit=${PAGE}&offset=${offset}${status ? `&status=${status}` : ""}${params.get("q") ? `&q=${encodeURIComponent(params.get("q")!)}` : ""}`),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader eyebrow="Staff" title="Organizations" />
      <form onSubmit={(e) => { e.preventDefault(); set({ q, offset: 0 }); }} className="mb-4 flex flex-col gap-2 sm:flex-row">
        <Input aria-label="Search organizations" placeholder="Search by name…" value={q} onChange={(e) => setQ(e.target.value)} className="sm:max-w-sm" />
        <Select aria-label="Status" value={status} onChange={(e) => set({ status: e.target.value, offset: 0 })} className="sm:w-44">
          <option value="">All</option><option value="active">Active</option><option value="suspended">Suspended</option>
        </Select>
        <Button type="submit" variant="outline">Search</Button>
      </form>
      {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        <>
          <Table>
            <thead><tr><Th>Name</Th><Th>Members</Th><Th>Teams</Th><Th>Plans</Th><Th>Tasks</Th><Th>Last active</Th><Th>Created</Th></tr></thead>
            <tbody>
              {list.isLoading && Array.from({ length: 5 }).map((_, i) => <tr key={i}><Td><Skeleton className="h-5 w-40" /></Td><Td /><Td /><Td /><Td /><Td /><Td /></tr>)}
              {list.data?.items.map((o) => (
                <tr key={o.id}>
                  <Td><Link href={`/staff/organizations/${o.id}`} className="font-semibold text-accent hover:underline">{o.name}</Link> {o.suspendedAt && <Badge tone="warn" className="ml-1">Suspended</Badge>}</Td>
                  <Td className="font-mono">{o.memberCount}</Td><Td className="font-mono">{o.teamCount}</Td><Td className="font-mono">{o.planCount}</Td><Td className="font-mono">{o.taskCount}</Td>
                  <Td>{relativeTime(o.lastActiveAt)}</Td><Td>{formatDate(o.createdAt)}</Td>
                </tr>
              ))}
              {list.data && !list.data.items.length && <tr><Td className="text-center text-muted" >No organizations match.</Td></tr>}
            </tbody>
          </Table>
          {list.data && (
            <div className="mt-3 flex items-center justify-between text-sm">
              <span className="text-muted">{list.data.total} total</span>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => set({ offset: Math.max(0, offset - PAGE) })}>Previous</Button>
                <Button size="sm" variant="outline" disabled={offset + PAGE >= list.data.total} onClick={() => set({ offset: offset + PAGE })}>Next</Button>
              </div>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default function StaffOrgsPage() {
  return <Suspense fallback={<PageLoader />}><Orgs /></Suspense>;
}
