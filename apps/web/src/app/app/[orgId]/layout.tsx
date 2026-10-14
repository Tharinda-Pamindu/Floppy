"use client";

import { use, type ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { Logo } from "@/components/brand";
import { RealtimeProvider } from "@/components/realtime";
import { ErrorState, PageLoader } from "@/components/ui/states";
import { useOrg } from "@/lib/queries";

export default function OrgLayout({ children, params }: { children: ReactNode; params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  const org = useOrg(orgId);

  if (org.isLoading) return <PageLoader label="Loading organization…" />;
  if (org.error || !org.data) {
    return (
      <div className="mx-auto max-w-xl space-y-6 p-6">
        <Logo href="/app" />
        <ErrorState error={org.error} onRetry={() => org.refetch()} notFound="This organization doesn't exist, or you're not a member of it." />
      </div>
    );
  }
  return (
    <RealtimeProvider orgId={orgId}>
      <AppShell org={org.data}>{children}</AppShell>
    </RealtimeProvider>
  );
}
