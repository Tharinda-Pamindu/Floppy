"use client";

import type { Team } from "@floppy/shared";
import { createTeamSchema, LIMITS } from "@floppy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Crown, GitBranch, Plus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { useOrgContext } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import { Avatar } from "@/components/ui/misc";
import { EmptyState, ErrorState, PageHeader, PageLoader } from "@/components/ui/states";
import { errorMessage, useApi } from "@/lib/api";
import { keys, useTeams } from "@/lib/queries";
import { fullName } from "@/lib/utils";

export default function TeamsPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const org = useOrgContext();
  const teams = useTeams(orgId);
  const isManager = org.role === "owner" || org.role === "admin";

  return (
    <>
      <PageHeader
        title="Teams"
        description="Every organization has at least one team. Each team's lead approves its members' plans."
        actions={isManager ? <NewTeam orgId={orgId} /> : undefined}
      />
      {teams.isLoading ? (
        <PageLoader />
      ) : teams.error ? (
        <ErrorState error={teams.error} onRetry={() => teams.refetch()} />
      ) : !teams.data?.length ? (
        <EmptyState icon={<Users className="h-6 w-6" />} title="No teams yet">{isManager ? "Create a team and pick its lead." : "An owner or admin will set up teams."}</EmptyState>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {teams.data.map((t) => <TeamCard key={t.id} orgId={orgId} team={t} />)}
        </ul>
      )}
    </>
  );
}

function TeamCard({ orgId, team }: { orgId: string; team: Team }) {
  return (
    <li>
      <Link href={`/app/${orgId}/teams/${team.id}`} className="label-card flex h-full flex-col p-4 transition-transform hover:-translate-y-0.5">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-display text-xl font-bold">{team.name}</h2>
          <span className="font-mono text-xs text-muted">{team.members.length} people</span>
        </div>
        {team.description && <p className="mt-1 line-clamp-2 text-sm text-ink-soft">{team.description}</p>}
        <div className="mt-auto pt-4">
          {team.lead ? (
            <div className="flex items-center gap-2 text-sm"><Crown className="h-4 w-4 text-brand" /><Avatar person={team.lead} size={24} /> {fullName(team.lead)}</div>
          ) : (
            <div className="flex items-center gap-2 text-sm font-semibold text-warn"><AlertTriangle className="h-4 w-4" />No lead yet, so nobody can approve plans</div>
          )}
          {team.repoCount > 0 && <div className="mt-2 flex items-center gap-1.5 font-mono text-xs text-muted"><GitBranch className="h-3.5 w-3.5" />{team.repoCount} repo{team.repoCount === 1 ? "" : "s"}</div>}
        </div>
      </Link>
    </li>
  );
}

function NewTeam({ orgId }: { orgId: string }) {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);
  const create = useMutation({
    mutationFn: () => api<Team>(`/organizations/${orgId}/teams`, { method: "POST", json: { name, description } }),
    onSuccess: async (team) => {
      await queryClient.invalidateQueries({ queryKey: keys.teams(orgId) });
      setOpen(false);
      router.push(`/app/${orgId}/teams/${team.id}?tab=people`);
    },
  });
  function submit() {
    const parsed = createTeamSchema.safeParse({ name, description });
    if (!parsed.success) return setFieldError(parsed.error.issues[0]?.message ?? "Check the name.");
    setFieldError(null);
    create.mutate();
  }
  return (
    <Dialog
      open={open}
      onOpenChange={setOpen}
      title="New team"
      trigger={<Button><Plus className="h-4 w-4" />New team</Button>}
      footer={<Button onClick={submit} loading={create.isPending}>Create team</Button>}
    >
      <div className="space-y-4">
        <Field label="Name" htmlFor="team-name" error={fieldError}>
          <Input id="team-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={LIMITS.teamNameMax} aria-invalid={!!fieldError} />
        </Field>
        <Field label="Description (optional)" htmlFor="team-desc">
          <Textarea id="team-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={LIMITS.teamDescriptionMax} />
        </Field>
        <FormError message={create.error ? errorMessage(create.error) : null} />
      </div>
    </Dialog>
  );
}
