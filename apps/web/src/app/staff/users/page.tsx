"use client";

import type { Paginated, StaffUser } from "@floppy/shared";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, MoreHorizontal, Pencil, Power, UserPlus } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input } from "@/components/ui/field";
import { Menu, MenuItem, Table, Td, Th } from "@/components/ui/misc";
import { ErrorState, PageHeader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { useMe } from "@/lib/queries";
import { formatDate, fullName } from "@/lib/utils";

const PAGE = 20;

export default function StaffUsers() {
  const api = useApi();
  const toast = useToast();
  const me = useMe();
  const queryClient = useQueryClient();
  const [q, setQ] = useState("");
  const [search, setSearch] = useState("");
  const [offset, setOffset] = useState(0);
  const [editing, setEditing] = useState<StaffUser | null>(null);
  const [password, setPassword] = useState<StaffUser | null>(null);
  const list = useQuery({
    queryKey: ["staff", "users", search, offset],
    queryFn: () => api<Paginated<StaffUser>>(`/staff/users?limit=${PAGE}&offset=${offset}${search ? `&q=${encodeURIComponent(search)}` : ""}`),
    placeholderData: keepPreviousData,
  });
  const toggle = useMutation({
    mutationFn: (u: StaffUser) => api<StaffUser>(`/staff/users/${u.id}`, { method: "PATCH", json: { isActive: !u.isActive } }),
    onSuccess: (u) => { void queryClient.invalidateQueries({ queryKey: ["staff", "users"] }); toast.ok(u.isActive ? "Reactivated." : "Deactivated. Their sessions have ended."); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const isSuper = me.data?.platformRole === "superadmin";

  return (
    <>
      <PageHeader eyebrow="Staff" title="Users" actions={<CreateCustomer />} />
      <form onSubmit={(e) => { e.preventDefault(); setOffset(0); setSearch(q); }} className="mb-4 flex gap-2">
        <Input aria-label="Search users" placeholder="Search by name or email…" value={q} onChange={(e) => setQ(e.target.value)} className="max-w-sm" />
        <Button type="submit" variant="outline">Search</Button>
      </form>
      {list.error ? <ErrorState error={list.error} onRetry={() => list.refetch()} /> : (
        <Table>
          <thead><tr><Th>Name</Th><Th>Type</Th><Th>Status</Th><Th>Joined</Th><Th /></tr></thead>
          <tbody>
            {list.data?.items.map((u) => {
              // Regular staff can't deactivate owners or staff; nobody deactivates themselves.
              const canToggle = u.id !== me.data?.id && (isSuper || (u.platformRole === "none" && !u.isOwner));
              return (
                <tr key={u.id}>
                  <Td><Link href={`/staff/users/${u.id}`} className="font-semibold text-accent hover:underline">{fullName(u)}</Link><div className="text-xs text-muted">{u.email}</div></Td>
                  <Td><span className="flex flex-wrap gap-1">{u.platformRole === "none" ? <Badge>Customer</Badge> : <Badge tone="ink">{u.platformRole === "superadmin" ? "Super admin" : "Staff"}</Badge>}{u.isOwner && <Badge tone="accent">Owner</Badge>}</span></Td>
                  <Td>{u.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}</Td>
                  <Td>{formatDate(u.createdAt)}</Td>
                  <Td className="text-right">
                    <Menu trigger={<Button size="icon-sm" variant="ghost" aria-label={`Actions for ${fullName(u)}`}><MoreHorizontal className="h-4 w-4" /></Button>}>
                      <MenuItem onSelect={() => setEditing(u)}><Pencil className="h-4 w-4" />Edit name</MenuItem>
                      <MenuItem onSelect={() => setPassword(u)} disabled={u.platformRole !== "none" && !isSuper}><KeyRound className="h-4 w-4" />Set password</MenuItem>
                      <MenuItem onSelect={() => toggle.mutate(u)} disabled={!canToggle} danger={u.isActive}><Power className="h-4 w-4" />{u.isActive ? "Deactivate" : "Reactivate"}{!canToggle && u.isOwner && " (super admin only)"}</MenuItem>
                    </Menu>
                  </Td>
                </tr>
              );
            })}
            {list.data && !list.data.items.length && <tr><Td className="text-muted">No users match.</Td></tr>}
          </tbody>
        </Table>
      )}
      {list.data && (
        <div className="mt-3 flex items-center justify-between text-sm">
          <span className="text-muted">{list.data.total} total</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>Previous</Button>
            <Button size="sm" variant="outline" disabled={offset + PAGE >= list.data.total} onClick={() => setOffset(offset + PAGE)}>Next</Button>
          </div>
        </div>
      )}
      {editing && <EditUser user={editing} onClose={() => setEditing(null)} />}
      {password && <SetPassword user={password} onClose={() => setPassword(null)} />}
    </>
  );
}

function CreateCustomer() {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", password: "" });
  const create = useMutation({
    mutationFn: () => api<StaffUser>("/staff/users", { method: "POST", json: form }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["staff", "users"] }); setOpen(false); setForm({ firstName: "", lastName: "", email: "", password: "" }); toast.ok("Customer account created."); },
  });
  return (
    <Dialog open={open} onOpenChange={setOpen} title="Add customer account" description="Staff accounts can't be created here." trigger={<Button><UserPlus className="h-4 w-4" />Add customer</Button>}
      footer={<Button onClick={() => create.mutate()} loading={create.isPending} disabled={!form.email || form.password.length < 8 || !form.firstName || !form.lastName}>Create</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" htmlFor="cc-first"><Input id="cc-first" value={form.firstName} onChange={(e) => setForm({ ...form, firstName: e.target.value })} /></Field>
        <Field label="Last name" htmlFor="cc-last"><Input id="cc-last" value={form.lastName} onChange={(e) => setForm({ ...form, lastName: e.target.value })} /></Field>
        <Field label="Email" htmlFor="cc-email" className="sm:col-span-2"><Input id="cc-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="Password" htmlFor="cc-pass" hint="At least 8 characters" className="sm:col-span-2"><Input id="cc-pass" type="password" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></Field>
      </div>
      <FormError message={create.error ? errorMessage(create.error) : null} />
    </Dialog>
  );
}

function EditUser({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const api = useApi();
  const queryClient = useQueryClient();
  const [firstName, setFirst] = useState(user.firstName);
  const [lastName, setLast] = useState(user.lastName);
  const save = useMutation({
    mutationFn: () => api(`/staff/users/${user.id}`, { method: "PATCH", json: { firstName, lastName } }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["staff", "users"] }); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Edit ${fullName(user)}`} footer={<Button onClick={() => save.mutate()} loading={save.isPending}>Save</Button>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="First name" htmlFor="eu-first"><Input id="eu-first" value={firstName} onChange={(e) => setFirst(e.target.value)} /></Field>
        <Field label="Last name" htmlFor="eu-last"><Input id="eu-last" value={lastName} onChange={(e) => setLast(e.target.value)} /></Field>
      </div>
      <FormError message={save.error ? errorMessage(save.error) : null} />
    </Dialog>
  );
}

function SetPassword({ user, onClose }: { user: StaffUser; onClose: () => void }) {
  const api = useApi();
  const toast = useToast();
  const [password, setPassword] = useState("");
  const save = useMutation({
    mutationFn: () => api(`/staff/users/${user.id}/password`, { method: "POST", json: { password } }),
    onSuccess: () => { toast.ok("Password set. Their other sessions were signed out."); onClose(); },
  });
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()} title={`Set a password for ${fullName(user)}`} footer={<Button onClick={() => save.mutate()} loading={save.isPending} disabled={password.length < 8}>Set password</Button>}>
      <Field label="New password" htmlFor="sp-pass" hint="At least 8 characters. Share it with them securely."><Input id="sp-pass" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
      <FormError message={save.error ? errorMessage(save.error) : null} />
    </Dialog>
  );
}
