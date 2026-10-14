"use client";

import { UserButton } from "@clerk/nextjs";
import { createOrganizationSchema, type OrganizationSummary } from "@floppy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Mail, PauseCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { ErrorState, Skeleton } from "@/components/ui/states";
import { errorMessage, useApi } from "@/lib/api";
import { keys, useMe, useOrgs } from "@/lib/queries";
import { LAST_ORG_KEY } from "@/lib/utils";

export default function Welcome() {
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();
  const me = useMe();
  const orgs = useOrgs();
  const [name, setName] = useState("");
  const [team, setTeam] = useState("Core team");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const create = useMutation({
    mutationFn: (input: { name: string; firstTeamName: string }) => api<OrganizationSummary>("/organizations", { method: "POST", json: input }),
    onSuccess: async (org) => {
      try {
        localStorage.setItem(LAST_ORG_KEY, org.id);
      } catch {
        // ignore
      }
      await queryClient.invalidateQueries({ queryKey: keys.orgs });
      router.push(`/app/${org.id}/teams`);
    },
    onError: (err) => setErrors({ name: errorMessage(err) }),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = createOrganizationSchema.safeParse({ name, firstTeamName: team });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    create.mutate({ name: parsed.data.name, firstTeamName: parsed.data.firstTeamName ?? "Core team" });
  }

  return (
    <div className="min-h-dvh">
      <header className="flex items-center justify-between border-b-2 border-rule px-4 py-3">
        <Logo href="/app" />
        <div className="flex items-center gap-2"><ThemeToggle /><UserButton /></div>
      </header>
      <main className="mx-auto max-w-4xl px-4 py-10">
        <h1 className="font-display text-4xl font-extrabold">Hi{me.data?.firstName ? ` ${me.data.firstName}` : ""}. Where are we planning?</h1>
        <p className="mt-2 text-ink-soft">Open one of your organizations, start a new one, or accept an invite from your email.</p>

        <div className="mt-8 grid gap-6 md:grid-cols-2">
          <section className="label-card p-5">
            <h2 className="font-display text-lg font-bold">Your organizations</h2>
            <div className="mt-4 space-y-2">
              {orgs.isLoading && <><Skeleton className="h-12" /><Skeleton className="h-12" /></>}
              {orgs.error && <ErrorState error={orgs.error} onRetry={() => orgs.refetch()} />}
              {orgs.data?.length === 0 && <p className="text-sm text-muted">You&apos;re not in any organization yet.</p>}
              {orgs.data?.map((o) =>
                o.suspended ? (
                  <div key={o.id} className="flex items-center justify-between rounded-xl border-2 border-rule-soft px-3 py-2.5 opacity-60">
                    <span className="flex items-center gap-2 font-semibold"><PauseCircle className="h-4 w-4" />{o.name}</span>
                    <Badge tone="warn">Suspended</Badge>
                  </div>
                ) : (
                  <Link key={o.id} href={`/app/${o.id}/week`} className="flex items-center justify-between rounded-xl border-2 border-rule px-3 py-2.5 font-semibold hover:bg-surface-2">
                    {o.name}
                    <span className="flex items-center gap-2"><Badge>{o.role}</Badge><ArrowRight className="h-4 w-4" /></span>
                  </Link>
                ),
              )}
            </div>
          </section>

          <section className="label-card p-5">
            <h2 className="font-display text-lg font-bold">Start an organization</h2>
            <p className="mt-1 text-sm text-ink-soft">You&apos;ll be its owner. Every organization starts with one team; add more any time.</p>
            <form onSubmit={submit} className="mt-4 space-y-4" noValidate>
              <Field label="Organization name" htmlFor="org-name" error={errors.name}>
                <Input id="org-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={100} placeholder="Acme Engineering" aria-invalid={!!errors.name} autoComplete="organization" />
              </Field>
              <Field label="First team" htmlFor="team-name" error={errors.firstTeamName} hint="e.g. Payments, Platform, Mobile">
                <Input id="team-name" value={team} onChange={(e) => setTeam(e.target.value)} maxLength={100} aria-invalid={!!errors.firstTeamName} />
              </Field>
              <Button type="submit" loading={create.isPending} className="w-full">Create organization</Button>
            </form>
          </section>
        </div>

        <div className="label-card-flat mt-6 flex items-start gap-3 border-dashed p-4 text-sm">
          <Mail className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
          <p><strong>Joining a team?</strong> Ask an owner or admin to invite your email. The invitation email has a link that adds you straight to their organization.</p>
        </div>
      </main>
    </div>
  );
}
