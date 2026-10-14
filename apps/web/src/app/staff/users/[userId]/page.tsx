"use client";

import type { StaffUserDetail } from "@floppy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Power } from "lucide-react";
import Link from "next/link";
import { use } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, Table, Td, Th } from "@/components/ui/misc";
import { ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { useMe } from "@/lib/queries";
import { formatDate, fullName } from "@/lib/utils";

export default function StaffUser({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = use(params);
  const api = useApi();
  const toast = useToast();
  const me = useMe();
  const queryClient = useQueryClient();
  const user = useQuery({ queryKey: ["staff", "user", userId], queryFn: () => api<StaffUserDetail>(`/staff/users/${userId}`), retry: false });
  const toggle = useMutation({
    mutationFn: (isActive: boolean) => api(`/staff/users/${userId}`, { method: "PATCH", json: { isActive } }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["staff"] }); toast.ok("Updated."); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  if (user.isLoading) return <PageLoader />;
  if (user.error || !user.data) return <ErrorState error={user.error} onRetry={() => user.refetch()} />;
  const u = user.data;
  const self = u.id === me.data?.id;
  const isSuper = me.data?.platformRole === "superadmin";
  const canToggle = !self && (isSuper || (u.platformRole === "none" && !u.isOwner));

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/staff/users" className="hover:underline">Users</Link>}
        title={<span className="flex items-center gap-3"><Avatar person={u} size={44} />{fullName(u)}</span>}
        description={`${u.email} · joined ${formatDate(u.createdAt)}`}
        actions={
          self ? <span className="text-sm text-muted">You can&apos;t deactivate yourself.</span> : canToggle ? (
            <Button variant={u.isActive ? "danger" : "primary"} onClick={() => toggle.mutate(!u.isActive)} loading={toggle.isPending}><Power className="h-4 w-4" />{u.isActive ? "Deactivate" : "Reactivate"}</Button>
          ) : <span className="text-sm text-muted">{u.isOwner ? "Owners are suspended from the super admin page." : "Only a super admin can change staff accounts."}</span>
        }
      />
      <div className="mb-6 flex flex-wrap gap-2">
        {u.platformRole === "none" ? <Badge>Customer</Badge> : <Badge tone="ink">{u.platformRole}</Badge>}
        {u.isOwner && <Badge tone="accent">Organization owner</Badge>}
        {u.isActive ? <Badge tone="ok">Active</Badge> : <Badge tone="danger">Deactivated</Badge>}
      </div>
      {!u.isActive && <p className="mb-6 rounded-xl border-2 border-danger bg-danger-soft px-4 py-2.5 text-sm">Deactivated accounts can&apos;t sign in, and any open sessions were ended.</p>}
      <h2 className="mb-2 font-display text-lg font-bold">Memberships</h2>
      <Table>
        <thead><tr><Th>Organization</Th><Th>Role</Th><Th>Joined</Th></tr></thead>
        <tbody>
          {u.memberships.map((m) => (
            <tr key={m.organizationId}>
              <Td><Link href={`/staff/organizations/${m.organizationId}`} className="font-semibold text-accent hover:underline">{m.organizationName}</Link> {m.organizationSuspended && <Badge tone="warn">Suspended</Badge>}</Td>
              <Td><Badge>{m.role}</Badge></Td>
              <Td>{formatDate(m.joinedAt)}</Td>
            </tr>
          ))}
          {!u.memberships.length && <tr><Td className="text-muted">Not in any organization.</Td></tr>}
        </tbody>
      </Table>
    </>
  );
}
