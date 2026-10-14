"use client";

import type { AuditEntry, DeletionRequest, OwnerRow, PersonRef, StaffUser } from "@floppy/shared";
import { LIMITS } from "@floppy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Ban, Check, Copy, KeyRound, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import { Table, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th } from "@/components/ui/misc";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { useMe } from "@/lib/queries";
import { formatDate, formatDateTime, fullName } from "@/lib/utils";

function Super() {
  const router = useRouter();
  const params = useSearchParams();
  const tab = params.get("tab") ?? "staff";
  return (
    <>
      <PageHeader eyebrow="Restricted" title="Super admin" description="Staff accounts, owner suspensions and organization deletions. Every action here is written to the audit log." />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/staff/super?tab=${v}`)}>
        <TabsList>
          <TabsTrigger value="staff">Staff accounts</TabsTrigger>
          <TabsTrigger value="owners">Owners</TabsTrigger>
          <TabsTrigger value="deletions">Deletion requests</TabsTrigger>
          <TabsTrigger value="audit">Audit log</TabsTrigger>
        </TabsList>
        <TabsContent value="staff"><StaffAccounts /></TabsContent>
        <TabsContent value="owners"><Owners /></TabsContent>
        <TabsContent value="deletions"><Deletions /></TabsContent>
        <TabsContent value="audit"><Audit /></TabsContent>
      </Tabs>
    </>
  );
}

function StaffAccounts() {
  const api = useApi();
  const toast = useToast();
  const me = useMe();
  const queryClient = useQueryClient();
  const staff = useQuery({ queryKey: ["super", "staff"], queryFn: () => api<StaffUser[]>("/staff/super/staff") });
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "" });
  const [created, setCreated] = useState<{ user: PersonRef; password: string } | null>(null);
  const create = useMutation({
    mutationFn: () => api<{ user: PersonRef; password: string }>("/staff/super/staff", { method: "POST", json: form }),
    onSuccess: (r) => { setCreated(r); setForm({ firstName: "", lastName: "", email: "" }); void queryClient.invalidateQueries({ queryKey: ["super"] }); },
  });
  const toggle = useMutation({
    mutationFn: (u: StaffUser) => api(`/staff/super/staff/${u.id}/${u.isActive ? "deactivate" : "reactivate"}`, { method: "POST" }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["super"] }); toast.ok("Updated."); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setCreated(null); }} title="New staff account" description="A strong password is generated and shown once."
          trigger={<Button><UserPlus className="h-4 w-4" />New staff account</Button>}
          footer={created ? <Button onClick={() => { setOpen(false); setCreated(null); }}>Done</Button> : <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!form.email || !form.firstName || !form.lastName}>Create</Button>}>
          {created ? (
            <div className="space-y-3 text-sm">
              <p>Created <strong>{created.user.email}</strong>. Copy the password now — it won&apos;t be shown again.</p>
              <div className="flex items-center gap-2 rounded-xl border border-rule bg-surface-2 px-3 py-2 font-mono">
                <span className="flex-1 break-all">{created.password}</span>
                <Button size="icon-sm" variant="ghost" aria-label="Copy password" onClick={() => navigator.clipboard.writeText(created.password).then(() => toast.ok("Copied."))}><Copy className="h-4 w-4" /></Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="First name" htmlFor="ns-first"><Input id="ns-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
              <Field label="Last name" htmlFor="ns-last"><Input id="ns-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
              <Field label="Email" htmlFor="ns-email" className="sm:col-span-2"><Input id="ns-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
              <FormError message={create.error ? errorMessage(create.error) : null} />
            </div>
          )}
        </Dialog>
      </div>
      {staff.isLoading ? <PageLoader /> : staff.error ? <ErrorState error={staff.error} onRetry={() => staff.refetch()} /> : (
        <Table>
          <thead><tr><Th>Name</Th><Th>Role</Th><Th>Status</Th><Th>Since</Th><Th /></tr></thead>
          <tbody>
            {staff.data?.map((u) => (
              <tr key={u.id}>
                <Td><span className="font-semibold">{fullName(u)}</span><div className="text-xs text-muted">{u.email}</div></Td>
                <Td><Badge tone="ink">{u.platformRole === "superadmin" ? "Super admin" : "Staff"}</Badge></Td>
                <Td>{u.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</Td>
                <Td>{formatDate(u.createdAt)}</Td>
                <Td className="text-right">{u.id !== me.data?.id && <Button size="sm" variant={u.isActive ? "outline" : "primary"} onClick={() => toggle.mutate(u)}>{u.isActive ? "Deactivate" : "Reactivate"}</Button>}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function Owners() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const owners = useQuery({ queryKey: ["super", "owners"], queryFn: () => api<OwnerRow[]>("/staff/super/owners") });
  const [target, setTarget] = useState<OwnerRow | null>(null);
  const [reason, setReason] = useState("");
  const suspend = useMutation({
    mutationFn: () => api(`/staff/super/owners/${target!.id}/suspend`, { method: "POST", json: { reason } }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["super"] }); toast.ok("Account suspended. They've been signed out everywhere."); setTarget(null); setReason(""); },
  });
  const reinstate = useMutation({
    mutationFn: (id: string) => api(`/staff/super/owners/${id}/reinstate`, { method: "POST" }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["super"] }); toast.ok("Account reinstated."); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (owners.isLoading) return <PageLoader />;
  if (owners.error) return <ErrorState error={owners.error} onRetry={() => owners.refetch()} />;
  return (
    <>
      <Table>
        <thead><tr><Th>Owner</Th><Th>Organizations</Th><Th>Status</Th><Th /></tr></thead>
        <tbody>
          {owners.data?.map((o) => (
            <tr key={o.id}>
              <Td><span className="font-semibold">{fullName(o)}</span><div className="text-xs text-muted">{o.email}</div></Td>
              <Td className="text-sm">{o.organizations.map((x) => x.name).join(", ")}</Td>
              <Td>{o.suspension ? <span><Badge tone="danger">Suspended</Badge><div className="mt-1 text-xs text-muted">{formatDateTime(o.suspension.at)} · {o.suspension.reason}</div></span> : o.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="warn">Deactivated</Badge>}</Td>
              <Td className="text-right">
                {o.suspension ? (
                  <Button size="sm" onClick={() => reinstate.mutate(o.id)}><ShieldCheck className="h-4 w-4" />Reinstate</Button>
                ) : (
                  <Button size="sm" variant="danger" onClick={() => setTarget(o)}><Ban className="h-4 w-4" />Suspend</Button>
                )}
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
      <Dialog open={!!target} onOpenChange={(o) => !o && setTarget(null)} title={target ? `Suspend ${fullName(target)}?` : ""} description="Their account is banned in Clerk: every session ends and they can't sign in until reinstated. They're told by email."
        footer={<Button variant="danger" onClick={() => suspend.mutate()} loading={suspend.isPending} disabled={!reason.trim()}>Suspend account</Button>}>
        <Field label="Reason" htmlFor="so-reason"><Textarea id="so-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={LIMITS.suspendReasonMax} /></Field>
        <FormError message={suspend.error ? errorMessage(suspend.error) : null} />
      </Dialog>
    </>
  );
}

function Deletions() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const requests = useQuery({ queryKey: ["super", "deletions"], queryFn: () => api<DeletionRequest[]>("/staff/super/deletion-requests") });
  const [deciding, setDeciding] = useState<{ r: DeletionRequest; decision: "approve" | "reject" } | null>(null);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState("");
  const decide = useMutation({
    mutationFn: () => api(`/staff/super/deletion-requests/${deciding!.r.id}/decision`, { method: "POST", json: { decision: deciding!.decision, note } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["super"] });
      toast.ok(deciding!.decision === "approve" ? "Organization deleted." : "Request rejected. The owner has been told.");
      setDeciding(null); setNote(""); setConfirm("");
    },
  });
  if (requests.isLoading) return <PageLoader />;
  if (requests.error) return <ErrorState error={requests.error} onRetry={() => requests.refetch()} />;
  const pending = requests.data?.filter((r) => r.status === "pending") ?? [];
  const decided = requests.data?.filter((r) => r.status !== "pending") ?? [];
  return (
    <div className="space-y-8">
      {!pending.length ? <EmptyState icon={<Check className="h-6 w-6" />} title="No pending requests" /> : (
        <ul className="grid gap-4 md:grid-cols-2">
          {pending.map((r) => (
            <li key={r.id} className="label-card space-y-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-lg font-bold">{r.organizationName}</h3>
                <span className="font-mono text-xs text-muted">{formatDateTime(r.createdAt)}</span>
              </div>
              <p className="text-sm">Requested by <strong>{fullName(r.requestedBy)}</strong>: “{r.reason}”</p>
              <p className="font-mono text-xs text-muted">{r.counts.members} members · {r.counts.teams} teams · {r.counts.plans} plans · {r.counts.tasks} tasks · {r.counts.pages} pages</p>
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => setDeciding({ r, decision: "reject" })}><X className="h-4 w-4" />Reject</Button>
                <Button size="sm" variant="danger" onClick={() => setDeciding({ r, decision: "approve" })}><Trash2 className="h-4 w-4" />Approve deletion</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
      {decided.length > 0 && (
        <Table>
          <thead><tr><Th>Organization</Th><Th>Decision</Th><Th>By</Th><Th>When</Th><Th>Note</Th></tr></thead>
          <tbody>
            {decided.map((r) => (
              <tr key={r.id}>
                <Td className="font-semibold">{r.organizationName}</Td>
                <Td><Badge tone={r.status === "approved" ? "danger" : r.status === "rejected" ? "neutral" : "ink"}>{r.status}</Badge></Td>
                <Td>{r.decidedBy ? fullName(r.decidedBy) : r.status === "cancelled" ? "Owner" : "—"}</Td>
                <Td>{formatDateTime(r.decidedAt)}</Td>
                <Td className="text-sm text-muted">{r.decisionNote ?? "—"}</Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
      <Dialog open={!!deciding} onOpenChange={(o) => !o && setDeciding(null)}
        title={deciding?.decision === "approve" ? `Permanently delete ${deciding.r.organizationName}?` : `Reject the request for ${deciding?.r.organizationName}?`}
        description={deciding?.decision === "approve" ? "Teams, plans, tasks, chats, repositories, pages and AI usage are deleted from Clerk and the database. This can't be undone." : "The organization stays as it is. Tell the owner why."}
        footer={<Button variant={deciding?.decision === "approve" ? "danger" : "primary"} onClick={() => decide.mutate()} loading={decide.isPending}
          disabled={deciding?.decision === "approve" ? confirm !== deciding.r.organizationName : !note.trim()}>{deciding?.decision === "approve" ? "Delete forever" : "Reject request"}</Button>}>
        <div className="space-y-3">
          {deciding?.decision === "approve" && (
            <Field label={<>Type <strong>{deciding.r.organizationName}</strong> to confirm</>} htmlFor="del-confirm"><Input id="del-confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" /></Field>
          )}
          <Field label={deciding?.decision === "approve" ? "Note to the owner (optional)" : "Why is it rejected?"} htmlFor="del-note">
            <Textarea id="del-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.deletionReasonMax} />
          </Field>
          <FormError message={decide.error ? errorMessage(decide.error) : null} />
        </div>
      </Dialog>
    </div>
  );
}

function Audit() {
  const api = useApi();
  const log = useQuery({ queryKey: ["super", "audit"], queryFn: () => api<AuditEntry[]>("/staff/super/audit") });
  if (log.isLoading) return <PageLoader />;
  if (log.error) return <ErrorState error={log.error} onRetry={() => log.refetch()} />;
  if (!log.data?.length) return <EmptyState icon={<KeyRound className="h-6 w-6" />} title="Nothing logged yet" />;
  return (
    <Table>
      <thead><tr><Th>When</Th><Th>Who</Th><Th>Action</Th><Th>Target</Th><Th>Reason</Th></tr></thead>
      <tbody>
        {log.data.map((e) => (
          <tr key={e.id}>
            <Td>{formatDateTime(e.createdAt)}</Td>
            <Td>{fullName(e.actor)}</Td>
            <Td className="font-mono text-xs">{e.action}</Td>
            <Td className="font-mono text-xs">{e.targetType}:{e.targetId.slice(0, 14)}</Td>
            <Td className="text-sm text-muted">{e.reason ?? "—"}</Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

export default function SuperPage() {
  return <Suspense fallback={<PageLoader />}><Super /></Suspense>;
}
