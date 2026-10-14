"use client";

import type { AiUsageEvent, OrgRole, Paginated, PersonRef, StaffOrganization } from "@floppy/shared";
import { LIMITS } from "@floppy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Crown, EyeOff, PauseCircle, PlayCircle } from "lucide-react";
import Link from "next/link";
import { use, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Textarea } from "@/components/ui/field";
import { Stat, Table, Td, Th } from "@/components/ui/misc";
import { ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { formatDate, formatDateTime, fullName, relativeTime } from "@/lib/utils";

interface Detail {
  organization: StaffOrganization;
  members: (PersonRef & { role: OrgRole; isActive: boolean; joinedAt: string })[];
  teams: { id: string; name: string; memberCount: number; lead: PersonRef | null }[];
}

export default function StaffOrg({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ["staff", "org", orgId], queryFn: () => api<Detail>(`/staff/organizations/${orgId}`), retry: false });
  const events = useQuery({ queryKey: ["staff", "org", orgId, "ai"], queryFn: () => api<Paginated<AiUsageEvent>>(`/staff/ai-usage/events?organizationId=${orgId}&limit=10`) });
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [reason, setReason] = useState("");
  const suspend = useMutation({
    mutationFn: () => api<Detail>(`/staff/organizations/${orgId}/suspend`, { method: "POST", json: { reason } }),
    onSuccess: (d) => { queryClient.setQueryData(["staff", "org", orgId], d); setSuspendOpen(false); setReason(""); toast.ok("Suspended. Members are locked out and have been notified."); },
  });
  const reinstate = useMutation({
    mutationFn: () => api<Detail>(`/staff/organizations/${orgId}/reinstate`, { method: "POST" }),
    onSuccess: (d) => { queryClient.setQueryData(["staff", "org", orgId], d); toast.ok("Reinstated."); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (detail.isLoading) return <PageLoader />;
  if (detail.error || !detail.data) return <ErrorState error={detail.error} onRetry={() => detail.refetch()} />;
  const { organization: o, members, teams } = detail.data;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/staff/organizations" className="hover:underline">Organizations</Link>}
        title={o.name}
        description={`Created ${formatDate(o.createdAt)} · last active ${relativeTime(o.lastActiveAt)}`}
        actions={o.suspendedAt ? (
          <Button onClick={() => reinstate.mutate()} loading={reinstate.isPending}><PlayCircle className="h-4 w-4" />Reinstate</Button>
        ) : (
          <Dialog open={suspendOpen} onOpenChange={setSuspendOpen} title={`Suspend ${o.name}?`} description="Every member is locked out of this organization until it's reinstated. They're told by email."
            trigger={<Button variant="danger"><PauseCircle className="h-4 w-4" />Suspend</Button>}
            footer={<Button variant="danger" onClick={() => suspend.mutate()} loading={suspend.isPending} disabled={!reason.trim()}>Suspend</Button>}>
            <Field label="Reason" htmlFor="sus-reason"><Textarea id="sus-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={LIMITS.suspendReasonMax} /></Field>
            <FormError message={suspend.error ? errorMessage(suspend.error) : null} />
          </Dialog>
        )}
      />
      {o.suspendedAt && <div className="mb-4 rounded-xl border border-warn bg-warn-soft px-4 py-2.5 text-sm"><strong>Suspended {formatDateTime(o.suspendedAt)}.</strong> {o.suspendedReason}</div>}
      <div className="mb-6 grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Stat label="Members" value={o.memberCount} /><Stat label="Teams" value={o.teamCount} /><Stat label="Plans" value={o.planCount} />
        <Stat label="Tasks" value={o.taskCount} /><Stat label="Messages" value={o.messageCount} /><Stat label="Pages" value={o.pageCount} />
      </div>
      <p className="mb-6 flex items-center gap-2 text-sm text-muted"><EyeOff className="h-4 w-4" />Staff see counts and people only. Plan text, chat messages and page content stay private to the customer.</p>
      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <section>
          <h2 className="mb-2 font-display text-lg font-bold">Members</h2>
          <Table>
            <thead><tr><Th>Name</Th><Th>Role</Th><Th>Joined</Th></tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.id}>
                  <Td><Link href={`/staff/users/${m.id}`} className="font-semibold text-accent hover:underline">{fullName(m)}</Link> {!m.isActive && <Badge tone="danger">Deactivated</Badge>}<div className="text-xs text-muted">{m.email}</div></Td>
                  <Td><Badge tone={m.role === "owner" ? "ink" : "neutral"}>{m.role}</Badge></Td>
                  <Td>{formatDate(m.joinedAt)}</Td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
        <section className="space-y-6">
          <div>
            <h2 className="mb-2 font-display text-lg font-bold">Teams</h2>
            <ul className="space-y-2">
              {teams.map((t) => (
                <li key={t.id} className="label-card-flat flex items-center justify-between px-3 py-2 text-sm">
                  <span className="font-semibold">{t.name}</span>
                  <span className="flex items-center gap-2 text-muted">{t.lead ? <><Crown className="h-3.5 w-3.5 text-warn" />{fullName(t.lead)}</> : "no lead"} · {t.memberCount}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-2 font-display text-lg font-bold">Recent AI calls</h2>
            {events.data?.items.length ? (
              <ul className="space-y-1 text-sm">
                {events.data.items.map((e) => (
                  <li key={e.id} className="flex justify-between gap-2 rounded-lg px-2 py-1 hover:bg-surface-2">
                    <span>{e.operation === "plan_review" ? "Plan review" : "Draft from notes"}</span>
                    <span className="font-mono text-xs"><Badge tone={e.outcome === "succeeded" ? "ok" : e.outcome === "failed" ? "danger" : "warn"}>{e.outcome}</Badge> {relativeTime(e.createdAt)}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-sm text-muted">No AI calls.</p>}
          </div>
        </section>
      </div>
    </>
  );
}
