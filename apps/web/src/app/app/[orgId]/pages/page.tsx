"use client";

import type { PageDetail, PageSummary } from "@floppy/shared";
import { LIMITS } from "@floppy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, FolderOpen, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { useOrgContext } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Select } from "@/components/ui/field";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { errorMessage, useApi } from "@/lib/api";
import { keys, useMe, usePages, useTeams } from "@/lib/queries";
import { fullName, relativeTime } from "@/lib/utils";

export default function PagesIndex({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const pages = usePages(orgId);
  const org = useOrgContext();
  const canCreate = org.role === "owner" || org.role === "admin" || org.isLead;

  const all = pages.data ?? [];
  const groups = new Map<string, { title: string; pages: PageSummary[] }>([["org", { title: "Organization-wide", pages: [] }]]);
  for (const p of all.filter((x) => !x.parentId)) {
    const key = p.teamId ?? "org";
    if (!groups.has(key)) groups.set(key, { title: p.teamName ?? "Team", pages: [] });
    groups.get(key)!.pages.push(p);
  }

  return (
    <>
      <PageHeader
        title="Pages"
        description="The project's shared notes. Every save is a version you can go back to, download or replace with a .md file."
        actions={canCreate ? <NewPage orgId={orgId} pages={all} /> : undefined}
      />
      {pages.isLoading ? (
        <PageLoader />
      ) : pages.error ? (
        <ErrorState error={pages.error} onRetry={() => pages.refetch()} />
      ) : !all.length ? (
        <EmptyState icon={<FileText className="h-6 w-6" />} title="No pages yet">
          {canCreate ? "Start with a project overview: goals, teams, links." : "Owners, admins and team leads can write pages here."}
        </EmptyState>
      ) : (
        <div className="grid gap-6 md:grid-cols-2">
          {[...groups.values()].filter((g) => g.pages.length).map((g) => (
            <section key={g.title} className="label-card-flat p-4">
              <h2 className="mb-3 flex items-center gap-2 font-display font-bold"><FolderOpen className="h-4 w-4 text-accent" />{g.title}</h2>
              <ul className="space-y-1">
                {g.pages.map((p) => (
                  <li key={p.id}>
                    <PageLink orgId={orgId} page={p} />
                    <ul className="ml-6 border-l-2 border-rule-soft pl-2">
                      {all.filter((c) => c.parentId === p.id).map((c) => <li key={c.id}><PageLink orgId={orgId} page={c} /></li>)}
                    </ul>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </>
  );
}

function PageLink({ orgId, page }: { orgId: string; page: PageSummary }) {
  return (
    <Link href={`/app/${orgId}/pages/${page.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-surface-2">
      <FileText className="h-4 w-4 shrink-0 text-muted" />
      <span className="min-w-0 flex-1 truncate font-medium">{page.title}</span>
      <span className="shrink-0 font-mono text-[11px] text-muted">v{page.currentVersion} · {relativeTime(page.updatedAt)}{page.updatedBy ? ` · ${fullName(page.updatedBy)}` : ""}</span>
    </Link>
  );
}

function NewPage({ orgId, pages }: { orgId: string; pages: PageSummary[] }) {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const org = useOrgContext();
  const me = useMe();
  const teams = useTeams(orgId);
  const isManager = org.role === "owner" || org.role === "admin";
  const allowedTeams = (teams.data ?? []).filter((t) => isManager || t.lead?.id === me.data?.id);
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [teamId, setTeamId] = useState<string>(isManager ? "" : "");
  const [parentId, setParentId] = useState("");
  const create = useMutation({
    mutationFn: () =>
      api<PageDetail>(`/organizations/${orgId}/pages`, {
        method: "POST",
        json: { title, bodyMd: `# ${title}\n\n`, teamId: teamId || null, parentId: parentId || null },
      }),
    onSuccess: (p) => {
      void queryClient.invalidateQueries({ queryKey: keys.pages(orgId) });
      setOpen(false);
      router.push(`/app/${orgId}/pages/${p.id}/edit`);
    },
  });
  const parents = pages.filter((p) => !p.parentId && (teamId ? p.teamId === teamId : !p.teamId || isManager));
  return (
    <Dialog open={open} onOpenChange={setOpen} title="New page" trigger={<Button><Plus className="h-4 w-4" />New page</Button>}
      footer={<Button onClick={() => create.mutate()} loading={create.isPending} disabled={!title.trim() || (!isManager && !teamId)}>Create and edit</Button>}>
      <div className="space-y-4">
        <Field label="Title" htmlFor="np-title"><Input id="np-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.pageTitleMax} placeholder="Project overview" /></Field>
        <Field label="Belongs to" htmlFor="np-team" hint={isManager ? "Team pages can be edited by that team's lead." : "Leads write pages for the teams they lead."}>
          <Select id="np-team" value={teamId} onChange={(e) => { setTeamId(e.target.value); setParentId(""); }}>
            {isManager ? <option value="">The whole organization</option> : <option value="">Choose a team…</option>}
            {allowedTeams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
          </Select>
        </Field>
        <Field label="Inside (optional)" htmlFor="np-parent" hint="Pages nest one level deep.">
          <Select id="np-parent" value={parentId} onChange={(e) => setParentId(e.target.value)}>
            <option value="">Top level</option>
            {parents.map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
          </Select>
        </Field>
        <FormError message={create.error ? errorMessage(create.error) : null} />
      </div>
    </Dialog>
  );
}
