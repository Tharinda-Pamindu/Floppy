"use client";

import type { Invite, Member, OrganizationDetail, OrgRole } from "@floppy/shared";
import { LIMITS } from "@floppy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy, LogOut, MailPlus, Trash2, TriangleAlert, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { useOrgContext } from "@/components/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { keys, useMe, useMembers } from "@/lib/queries";
import { formatDate, fullName } from "@/lib/utils";

const ROLE_TEXT: Record<OrgRole, string> = { owner: "an owner", admin: "an admin", member: "a member" };

export default function SettingsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const org = useOrgContext();
  const isManager = org.role === "owner" || org.role === "admin";
  return (
    <>
      <PageHeader title="Organization" description={`You're ${ROLE_TEXT[org.role]} of ${org.name}.`} />
      <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
        <div className="space-y-6">
          {isManager && <OrgName orgId={orgId} org={org} />}
          <People orgId={orgId} org={org} />
        </div>
        <div className="space-y-6">
          {isManager && <Invites orgId={orgId} />}
          <Leave orgId={orgId} org={org} />
          {org.role === "owner" && <DeletionRequest orgId={orgId} org={org} />}
        </div>
      </div>
    </>
  );
}

function OrgName({ orgId, org }: { orgId: string; org: OrganizationDetail }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [name, setName] = useState(org.name);
  const save = useMutation({
    mutationFn: () => api<OrganizationDetail>(`/organizations/${orgId}`, { method: "PATCH", json: { name } }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: keys.org(orgId) }); void queryClient.invalidateQueries({ queryKey: keys.orgs }); toast.ok("Renamed."); },
  });
  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="label-card-flat space-y-3 p-4">
      <h2 className="font-display font-bold">Name</h2>
      <div className="flex gap-2">
        <Input aria-label="Organization name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.orgNameMax} />
        <Button type="submit" loading={save.isPending} disabled={!name.trim() || name === org.name}>Save</Button>
      </div>
      <FormError message={save.error ? errorMessage(save.error) : null} />
    </form>
  );
}

function People({ orgId, org }: { orgId: string; org: OrganizationDetail }) {
  const api = useApi();
  const toast = useToast();
  const me = useMe();
  const queryClient = useQueryClient();
  const members = useMembers(orgId);
  const isOwner = org.role === "owner";
  const isAdmin = org.role === "admin";
  const changeRole = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: OrgRole }) => api<Member[]>(`/organizations/${orgId}/members/${userId}`, { method: "PATCH", json: { role } }),
    onSuccess: (list) => { queryClient.setQueryData(keys.members(orgId), list); toast.ok("Role changed."); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/organizations/${orgId}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: keys.members(orgId) }); toast.ok("Removed from the organization."); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (members.isLoading) return <PageLoader />;
  if (members.error) return <ErrorState error={members.error} onRetry={() => members.refetch()} />;
  return (
    <section className="label-card-flat overflow-hidden">
      <h2 className="border-b-2 border-rule-soft px-4 py-3 font-display font-bold">People · {members.data?.length}</h2>
      <ul className="divide-y-2 divide-rule-soft">
        {members.data?.map((m) => {
          const self = m.id === me.data?.id;
          // Owners manage everyone; admins manage admins and members but never owners. Nobody manages themselves.
          const canManage = !self && (isOwner || (isAdmin && m.role !== "owner"));
          const roles: OrgRole[] = isOwner ? ["owner", "admin", "member"] : ["admin", "member"];
          const canRemove = !self && (isOwner || (isAdmin && m.role === "member"));
          return (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar person={m} size={32} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{fullName(m)} {self && <span className="text-xs text-muted">(you)</span>}</div>
                <div className="truncate text-xs text-muted">{m.email} · joined {formatDate(m.joinedAt)}</div>
              </div>
              {canManage ? (
                <Select aria-label={`Role for ${fullName(m)}`} value={m.role} onChange={(e) => changeRole.mutate({ userId: m.id, role: e.target.value as OrgRole })} className="h-9 w-32">
                  {roles.map((r) => <option key={r} value={r}>{r}</option>)}
                </Select>
              ) : (
                <Badge tone={m.role === "owner" ? "ink" : m.role === "admin" ? "accent" : "neutral"}>{m.role}</Badge>
              )}
              {canRemove && <Button size="icon-sm" variant="ghost" aria-label={`Remove ${fullName(m)}`} onClick={() => remove.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Invites({ orgId }: { orgId: string }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const invites = useQuery({ queryKey: ["org", orgId, "invites"], queryFn: () => api<Invite[]>(`/organizations/${orgId}/invites`) });
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"member" | "admin">("member");
  const [last, setLast] = useState<Invite | null>(null);
  const create = useMutation({
    mutationFn: () => api<Invite>(`/organizations/${orgId}/invites`, { method: "POST", json: { email, role } }),
    onSuccess: (inv) => { setLast(inv); setEmail(""); void queryClient.invalidateQueries({ queryKey: ["org", orgId, "invites"] }); },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api(`/organizations/${orgId}/invites/${id}`, { method: "DELETE" }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["org", orgId, "invites"] }); toast.ok("Invite cancelled."); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <section className="label-card-flat space-y-3 p-4">
      <h2 className="font-display font-bold">Invite people</h2>
      <form onSubmit={(e) => { e.preventDefault(); create.mutate(); }} className="space-y-2">
        <Input type="email" aria-label="Email" placeholder="teammate@company.com" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
        <div className="flex gap-2">
          <Select aria-label="Role" value={role} onChange={(e) => setRole(e.target.value as "member" | "admin")} className="w-36">
            <option value="member">Member</option>
            <option value="admin">Admin</option>
          </Select>
          <Button type="submit" className="flex-1" loading={create.isPending} disabled={!email.includes("@")}><MailPlus className="h-4 w-4" />Send invite</Button>
        </div>
        <FormError message={create.error ? errorMessage(create.error) : null} />
      </form>
      {last && (
        <div className="rounded-xl border-2 border-ok bg-ok-soft p-3 text-sm">
          Invitation emailed to <strong>{last.email}</strong>. It works for that address only.
          {last.url && (
            <Button size="sm" variant="outline" className="mt-2" onClick={() => navigator.clipboard.writeText(last.url!).then(() => toast.ok("Link copied."))}><Copy className="h-3.5 w-3.5" />Copy link</Button>
          )}
        </div>
      )}
      <div>
        <h3 className="mb-1 font-mono text-[11px] font-bold tracking-widest text-muted uppercase">Pending</h3>
        {invites.data?.length ? (
          <ul className="space-y-1">
            {invites.data.map((i) => (
              <li key={i.id} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2">
                <span className="min-w-0 flex-1 truncate">{i.email}</span>
                <Badge>{i.role}</Badge>
                <button aria-label={`Cancel invite for ${i.email}`} onClick={() => revoke.mutate(i.id)} className="text-muted hover:text-danger"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted">No pending invites.</p>
        )}
      </div>
    </section>
  );
}

function Leave({ orgId, org }: { orgId: string; org: OrganizationDetail }) {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const leave = useMutation({
    mutationFn: () => api(`/organizations/${orgId}/membership`, { method: "DELETE" }),
    onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: keys.orgs }); router.push("/app/welcome"); },
  });
  return (
    <section className="label-card-flat space-y-2 p-4">
      <h2 className="font-display font-bold">Leave {org.name}</h2>
      <p className="text-sm text-ink-soft">Your past plans stay in the team&apos;s history.</p>
      <Dialog open={open} onOpenChange={setOpen} title={`Leave ${org.name}?`} trigger={<Button variant="outline"><LogOut className="h-4 w-4" />Leave organization</Button>}
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Stay</Button><Button variant="danger" onClick={() => leave.mutate()} loading={leave.isPending}>Yes, leave</Button></>}>
        <p className="text-sm">You&apos;ll need a new invite to come back.</p>
        <FormError message={leave.error ? errorMessage(leave.error) : null} />
      </Dialog>
    </section>
  );
}

function DeletionRequest({ orgId, org }: { orgId: string; org: OrganizationDetail }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.org(orgId) });
  const request = useMutation({
    mutationFn: () => api(`/organizations/${orgId}/deletion-request`, { method: "POST", json: { reason } }),
    onSuccess: () => { void refresh(); setOpen(false); toast.ok("Request sent. You'll get an email when it's decided."); },
  });
  const cancel = useMutation({
    mutationFn: () => api(`/organizations/${orgId}/deletion-request`, { method: "DELETE" }),
    onSuccess: () => { void refresh(); toast.ok("Deletion request cancelled."); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  return (
    <section className="label-card-flat space-y-2 border-danger p-4">
      <h2 className="flex items-center gap-2 font-display font-bold text-danger"><TriangleAlert className="h-4 w-4" />Delete organization</h2>
      {org.pendingDeletion ? (
        <>
          <p className="text-sm">A deletion request is waiting for review (sent {formatDate(org.pendingDeletion.requestedAt)}). The organization keeps working until it&apos;s approved.</p>
          <p className="text-sm text-ink-soft">“{org.pendingDeletion.reason}”</p>
          <Button variant="outline" onClick={() => cancel.mutate()} loading={cancel.isPending}>Cancel the request</Button>
        </>
      ) : (
        <>
          <p className="text-sm text-ink-soft">Deleting removes every team, plan, task, chat and page for good. A Floppy administrator reviews each request first.</p>
          <Dialog open={open} onOpenChange={setOpen} title="Ask to delete this organization" description="Once approved, this can't be undone."
            trigger={<Button variant="danger">Request deletion</Button>}
            footer={<Button variant="danger" onClick={() => request.mutate()} loading={request.isPending} disabled={!reason.trim()}>Send request</Button>}>
            <Field label="Why?" htmlFor="del-reason"><Textarea id="del-reason" value={reason} onChange={(e) => setReason(e.target.value)} maxLength={LIMITS.deletionReasonMax} /></Field>
            <FormError message={request.error ? errorMessage(request.error) : null} />
          </Dialog>
        </>
      )}
    </section>
  );
}
