"use client";

import type { GithubIssue, Paginated, Team, TeamRepo, TeamWeekRow, WeekRollup } from "@floppy/shared";
import { addWeeks, LIMITS, mondayOf, weekLabel, weekRange } from "@floppy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight, Crown, ExternalLink, GitBranch, Lock, Trash2, UserPlus } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useState } from "react";
import { useOrgContext } from "@/components/app-shell";
import { PlanStatusBadge, ShippedBadge } from "@/components/plan/status";
import { AssignTaskDialog } from "@/components/tasks/assign-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select, Textarea } from "@/components/ui/field";
import { Avatar, Table, Tabs, TabsContent, TabsList, TabsTrigger, Td, Th } from "@/components/ui/misc";
import { EmptyState, ErrorState, PageHeader, PageLoader, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { keys, useMe, useMembers } from "@/lib/queries";
import { fullName } from "@/lib/utils";

function TeamDetail({ orgId, teamId }: { orgId: string; teamId: string }) {
  const api = useApi();
  const org = useOrgContext();
  const router = useRouter();
  const params = useSearchParams();
  const team = useQuery({ queryKey: keys.team(orgId, teamId), queryFn: () => api<Team>(`/organizations/${orgId}/teams/${teamId}`), retry: false });
  const me = useMe();
  const isManager = org.role === "owner" || org.role === "admin";

  if (team.isLoading || me.isLoading) return <PageLoader />;
  if (team.error || !team.data) return <ErrorState error={team.error} onRetry={() => team.refetch()} notFound="This team doesn't exist in this organization." />;
  const t = team.data;
  const canView = isManager || (!!me.data && t.lead?.id === me.data.id);
  const tab = params.get("tab") ?? (canView ? "week" : "people");

  return (
    <>
      <PageHeader eyebrow="Team" title={t.name} description={t.description ?? undefined} />
      <Tabs value={tab} onValueChange={(v) => router.replace(`/app/${orgId}/teams/${teamId}?tab=${v}`)}>
        <TabsList>
          <TabsTrigger value="week">This week</TabsTrigger>
          <TabsTrigger value="history">History</TabsTrigger>
          <TabsTrigger value="people">People</TabsTrigger>
          <TabsTrigger value="repos">Repositories</TabsTrigger>
          {isManager && <TabsTrigger value="settings">Settings</TabsTrigger>}
        </TabsList>
        <TabsContent value="week"><LeadOnly team={t}><TeamWeek orgId={orgId} team={t} /></LeadOnly></TabsContent>
        <TabsContent value="history"><LeadOnly team={t}><TeamHistory orgId={orgId} team={t} /></LeadOnly></TabsContent>
        <TabsContent value="people"><People orgId={orgId} team={t} isManager={isManager} /></TabsContent>
        <TabsContent value="repos"><Repos orgId={orgId} team={t} isManager={isManager} /></TabsContent>
        {isManager && <TabsContent value="settings"><TeamSettings orgId={orgId} team={t} /></TabsContent>}
      </Tabs>
    </>
  );
}

/** Team week and history are for the team's lead and org owners/admins; the API enforces it too. */
function LeadOnly({ team, children }: { team: Team; children: React.ReactNode }) {
  const me = useMe();
  const org = useOrgContext();
  if (!me.data) return <Spinner />;
  const allowed = org.role === "owner" || org.role === "admin" || team.lead?.id === me.data.id;
  if (!allowed) {
    return (
      <EmptyState icon={<Lock className="h-6 w-6" />} title="The team's week is for its lead">
        Team leads and organization admins see everyone&apos;s week here. You can see your own week under My week.
      </EmptyState>
    );
  }
  return <>{children}</>;
}

function TeamWeek({ orgId, team }: { orgId: string; team: Team }) {
  const api = useApi();
  const current = mondayOf(new Date());
  const [week, setWeek] = useState(current);
  const rows = useQuery({
    queryKey: [...keys.team(orgId, team.id), "week", week],
    queryFn: () => api<TeamWeekRow[]>(`/organizations/${orgId}/teams/${team.id}/weeks/${week}`),
  });
  const data = rows.data ?? [];
  const submitted = data.filter((r) => r.plan && r.plan.status !== "draft").length;
  const approved = data.filter((r) => r.plan && (r.plan.status === "approved" || r.plan.status === "done")).length;
  const shipped = data.filter((r) => r.plan?.mainGoalShipped).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-full border-2 border-rule bg-surface p-1">
          <Button variant="ghost" size="icon-sm" aria-label="Previous week" onClick={() => setWeek(addWeeks(week, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="px-2 text-sm font-semibold">{weekLabel(week)} <span className="font-mono text-xs text-muted">{weekRange(week)}</span></span>
          <Button variant="ghost" size="icon-sm" aria-label="Next week" onClick={() => setWeek(addWeeks(week, 1))} disabled={week >= addWeeks(current, 1)}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <p className="font-mono text-sm text-muted">{submitted}/{data.length} submitted · {approved} approved · {shipped} shipped</p>
      </div>
      {rows.isLoading ? <PageLoader /> : rows.error ? <ErrorState error={rows.error} onRetry={() => rows.refetch()} /> : (
        <Table>
          <thead><tr><Th>Person</Th><Th>Main task</Th><Th>Progress</Th><Th>Status</Th></tr></thead>
          <tbody>
            {data.map(({ member, plan }) => (
              <tr key={member.id}>
                <Td><span className="flex items-center gap-2 font-semibold"><Avatar person={member} size={26} />{fullName(member)}{member.isLead && <Crown className="h-3.5 w-3.5 text-brand" aria-label="Lead" />}</span></Td>
                <Td className="max-w-72">
                  {!plan ? <span className="text-muted">Not started</span> : plan.readable ? (
                    <Link href={`/app/${orgId}/plans/${plan.id}`} className="line-clamp-2 font-medium text-accent hover:underline">{plan.mainTaskTitle ?? "No main task"}</Link>
                  ) : <span className="text-muted italic">Still drafting (private)</span>}
                </Td>
                <Td>
                  {plan?.readable && plan.tasksTotal > 0 ? (
                    <div className="flex items-center gap-2">
                      <div className="h-2 w-24 overflow-hidden rounded-full bg-surface-2"><div className="h-full bg-accent" style={{ width: `${(plan.tasksDone / plan.tasksTotal) * 100}%` }} /></div>
                      <span className="font-mono text-xs">{plan.tasksDone}/{plan.tasksTotal}</span>
                    </div>
                  ) : "—"}
                </Td>
                <Td><span className="flex flex-wrap gap-1"><PlanStatusBadge status={plan?.status ?? null} />{plan && <ShippedBadge shipped={plan.mainGoalShipped} />}</span></Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  );
}

function TeamHistory({ orgId, team }: { orgId: string; team: Team }) {
  const api = useApi();
  const history = useQuery({ queryKey: [...keys.team(orgId, team.id), "history"], queryFn: () => api<Paginated<WeekRollup>>(`/organizations/${orgId}/teams/${team.id}/weeks?limit=12`) });
  if (history.isLoading) return <PageLoader />;
  if (history.error) return <ErrorState error={history.error} onRetry={() => history.refetch()} />;
  if (!history.data?.items.length) return <EmptyState title="No history yet">Weeks appear once members write plans.</EmptyState>;
  return (
    <Table>
      <thead><tr><Th>Week</Th><Th>Submitted</Th><Th>Approved</Th><Th>Shipped of closed</Th></tr></thead>
      <tbody>
        {history.data.items.map((w) => (
          <tr key={w.weekStart}>
            <Td className="font-semibold">{weekRange(w.weekStart)}</Td>
            <Td className="font-mono">{w.submitted}/{w.memberCount}</Td>
            <Td className="font-mono">{w.approved}/{w.memberCount}</Td>
            <Td className="font-mono">
              <span className="inline-flex items-center gap-2">{w.shipped}/{w.closed}
                <span className="h-2 w-16 overflow-hidden rounded-full bg-surface-2"><span className="block h-full bg-ok" style={{ width: `${w.closed ? (w.shipped / w.closed) * 100 : 0}%` }} /></span>
              </span>
            </Td>
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

function People({ orgId, team, isManager }: { orgId: string; team: Team; isManager: boolean }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const members = useMembers(orgId);
  const [adding, setAdding] = useState("");
  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: keys.team(orgId, team.id) });
    void queryClient.invalidateQueries({ queryKey: keys.teams(orgId) });
  };
  const setMember = useMutation({
    mutationFn: ({ userId, isLead }: { userId: string; isLead: boolean }) => api(`/organizations/${orgId}/teams/${team.id}/members/${userId}`, { method: "PUT", json: { isLead } }),
    onSuccess: () => { invalidate(); setAdding(""); toast.ok("Team updated."); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const remove = useMutation({
    mutationFn: (userId: string) => api(`/organizations/${orgId}/teams/${team.id}/members/${userId}`, { method: "DELETE" }),
    onSuccess: () => { invalidate(); toast.ok("Removed from the team."); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const outside = (members.data ?? []).filter((m) => !team.members.some((t) => t.id === m.id));

  return (
    <div className="space-y-4">
      {isManager && (
        <div className="label-card-flat flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
          <Select aria-label="Add someone to the team" value={adding} onChange={(e) => setAdding(e.target.value)} className="sm:max-w-xs">
            <option value="">Add someone to the team…</option>
            {outside.map((m) => <option key={m.id} value={m.id}>{fullName(m)} ({m.email})</option>)}
          </Select>
          <Button onClick={() => setMember.mutate({ userId: adding, isLead: false })} disabled={!adding} loading={setMember.isPending}><UserPlus className="h-4 w-4" />Add to team</Button>
        </div>
      )}
      {!team.lead && <p className="rounded-xl border-2 border-warn bg-warn-soft px-3 py-2 text-sm font-semibold text-warn">This team has no lead, so nobody can approve its members&apos; plans.</p>}
      {team.members.length === 0 ? (
        <EmptyState title="Nobody on this team yet" />
      ) : (
        <ul className="label-card-flat divide-y-2 divide-rule-soft">
          {team.members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <Avatar person={m} size={32} />
              <div className="min-w-0 flex-1">
                <div className="font-semibold">{fullName(m)} {m.isLead && <Badge tone="accent" className="ml-1"><Crown className="h-3 w-3" />Lead</Badge>}</div>
                <div className="truncate text-xs text-muted">{m.email}</div>
              </div>
              <AssignTaskDialog orgId={orgId} assignee={m} teamId={team.id} />
              {isManager && (
                <>
                  {!m.isLead && <Button size="sm" variant="outline" onClick={() => setMember.mutate({ userId: m.id, isLead: true })}><Crown className="h-3.5 w-3.5" />Make lead</Button>}
                  <Button size="icon-sm" variant="ghost" aria-label={`Remove ${fullName(m)} from the team`} onClick={() => remove.mutate(m.id)}><Trash2 className="h-4 w-4" /></Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Repos({ orgId, team, isManager }: { orgId: string; team: Team; isManager: boolean }) {
  const api = useApi();
  const toast = useToast();
  const queryClient = useQueryClient();
  const me = useMe();
  const canManage = isManager || team.lead?.id === me.data?.id;
  const repos = useQuery({ queryKey: [...keys.team(orgId, team.id), "repos"], queryFn: () => api<TeamRepo[]>(`/organizations/${orgId}/teams/${team.id}/repos`) });
  const [repo, setRepo] = useState("");
  const [selected, setSelected] = useState<string | null>(null);
  const link = useMutation({
    mutationFn: () => api<TeamRepo>(`/organizations/${orgId}/teams/${team.id}/repos`, { method: "POST", json: { repo } }),
    onSuccess: (r) => { setRepo(""); setSelected(r.id); void queryClient.invalidateQueries({ queryKey: keys.team(orgId, team.id) }); toast.ok(`Linked ${r.fullName}.`); },
  });
  const unlink = useMutation({
    mutationFn: (id: string) => api(`/organizations/${orgId}/teams/${team.id}/repos/${id}`, { method: "DELETE" }),
    onSuccess: () => { setSelected(null); void queryClient.invalidateQueries({ queryKey: keys.team(orgId, team.id) }); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const active = selected ?? repos.data?.[0]?.id ?? null;

  return (
    <div className="space-y-4">
      {canManage && (
        <form onSubmit={(e) => { e.preventDefault(); link.mutate(); }} className="label-card-flat space-y-2 p-3">
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input aria-label="GitHub repository" placeholder="owner/repo or https://github.com/owner/repo" value={repo} onChange={(e) => setRepo(e.target.value)} />
            <Button type="submit" loading={link.isPending} disabled={!repo.trim()}><GitBranch className="h-4 w-4" />Link repository</Button>
          </div>
          <FormError message={link.error ? errorMessage(link.error) : null} />
        </form>
      )}
      {repos.isLoading ? <PageLoader /> : repos.error ? <ErrorState error={repos.error} onRetry={() => repos.refetch()} /> : !repos.data?.length ? (
        <EmptyState icon={<GitBranch className="h-6 w-6" />} title="No repositories linked">{canManage ? "Link a GitHub repository to see its open issues and assign them as tasks." : "The team lead can link GitHub repositories here."}</EmptyState>
      ) : (
        <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
          <ul className="space-y-2">
            {repos.data.map((r) => (
              <li key={r.id} className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 ${r.id === active ? "border-rule bg-accent-soft" : "border-rule-soft"}`}>
                <button className="min-w-0 flex-1 truncate text-left font-mono text-sm font-semibold" onClick={() => setSelected(r.id)}>{r.fullName}</button>
                <a href={r.htmlUrl} target="_blank" rel="noopener noreferrer" aria-label={`Open ${r.fullName} on GitHub`}><ExternalLink className="h-3.5 w-3.5" /></a>
                {canManage && <button aria-label={`Unlink ${r.fullName}`} onClick={() => unlink.mutate(r.id)} className="text-muted hover:text-danger"><Trash2 className="h-3.5 w-3.5" /></button>}
              </li>
            ))}
          </ul>
          {active && <Issues orgId={orgId} team={team} repoId={active} canAssign={canManage} />}
        </div>
      )}
    </div>
  );
}

function Issues({ orgId, team, repoId, canAssign }: { orgId: string; team: Team; repoId: string; canAssign: boolean }) {
  const api = useApi();
  const [page, setPage] = useState(1);
  const issues = useQuery({
    queryKey: [...keys.team(orgId, team.id), "issues", repoId, page],
    queryFn: () => api<{ issues: GithubIssue[]; hasMore: boolean }>(`/organizations/${orgId}/teams/${team.id}/repos/${repoId}/issues?page=${page}`),
  });
  if (issues.isLoading) return <PageLoader label="Loading issues from GitHub…" />;
  if (issues.error) return <ErrorState error={issues.error} onRetry={() => issues.refetch()} />;
  if (!issues.data?.issues.length) return <EmptyState title="No open issues">Nice and tidy.</EmptyState>;
  return (
    <div className="space-y-3">
      <ul className="label-card-flat divide-y-2 divide-rule-soft">
        {issues.data.issues.map((i) => (
          <li key={i.number} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="font-mono text-xs text-muted">#{i.number}</span>
            <a href={i.url} target="_blank" rel="noopener noreferrer" className="min-w-0 flex-1 font-medium hover:text-accent">{i.title}</a>
            {i.labels.slice(0, 3).map((l) => <Badge key={l}>{l}</Badge>)}
            {i.assignedTaskId ? (
              <Link href={`/app/${orgId}/tasks/${i.assignedTaskId}`} className="text-xs font-semibold text-accent">Assigned →</Link>
            ) : canAssign ? (
              <AssignTaskDialog orgId={orgId} teamId={team.id} members={team.members} github={{ repoId, issue: i }} />
            ) : null}
          </li>
        ))}
      </ul>
      <div className="flex justify-between">
        <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(page - 1)}>Previous</Button>
        <Button size="sm" variant="outline" disabled={!issues.data.hasMore} onClick={() => setPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

function TeamSettings({ orgId, team }: { orgId: string; team: Team }) {
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const org = useOrgContext();
  const [name, setName] = useState(team.name);
  const [description, setDescription] = useState(team.description ?? "");
  const [confirm, setConfirm] = useState(false);
  const save = useMutation({
    mutationFn: () => api<Team>(`/organizations/${orgId}/teams/${team.id}`, { method: "PATCH", json: { name, description } }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: keys.team(orgId, team.id) }); void queryClient.invalidateQueries({ queryKey: keys.teams(orgId) }); toast.ok("Team saved."); },
  });
  const del = useMutation({
    mutationFn: () => api(`/organizations/${orgId}/teams/${team.id}`, { method: "DELETE" }),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: keys.teams(orgId) }); router.push(`/app/${orgId}/teams`); },
  });
  const lastTeam = org.teamCount <= 1;
  return (
    <div className="grid gap-6 md:grid-cols-2">
      <form onSubmit={(e) => { e.preventDefault(); save.mutate(); }} className="label-card-flat space-y-4 p-4">
        <h2 className="font-display font-bold">Rename and describe</h2>
        <Field label="Name" htmlFor="ts-name"><Input id="ts-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.teamNameMax} /></Field>
        <Field label="Description" htmlFor="ts-desc"><Textarea id="ts-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.teamDescriptionMax} /></Field>
        <FormError message={save.error ? errorMessage(save.error) : null} />
        <Button type="submit" loading={save.isPending}>Save</Button>
      </form>
      <div className="label-card-flat space-y-3 border-danger p-4">
        <h2 className="font-display font-bold text-danger">Delete team</h2>
        <p className="text-sm text-ink-soft">Plans, assigned tasks and pages are kept. Team pages become organization-wide.</p>
        {lastTeam && <p className="text-sm font-semibold text-warn">An organization needs at least one team, so this one can&apos;t be deleted.</p>}
        <Dialog open={confirm} onOpenChange={setConfirm} title={`Delete ${team.name}?`} trigger={<Button variant="danger" disabled={lastTeam}><Trash2 className="h-4 w-4" />Delete team</Button>}
          footer={<Button variant="danger" onClick={() => del.mutate()} loading={del.isPending}>Yes, delete</Button>}>
          <p className="text-sm">People stay in the organization; only the team goes away.</p>
          <FormError message={del.error ? errorMessage(del.error) : null} />
        </Dialog>
      </div>
    </div>
  );
}

export default function TeamPage({ params }: { params: Promise<{ orgId: string; teamId: string }> }) {
  const { orgId, teamId } = use(params);
  return (
    <Suspense fallback={<PageLoader />}>
      <TeamDetail orgId={orgId} teamId={teamId} />
    </Suspense>
  );
}
