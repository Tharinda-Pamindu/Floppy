"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ErrorState, PageLoader } from "@/components/ui/states";
import { useOrgs } from "@/lib/queries";
import { LAST_ORG_KEY } from "@/lib/utils";

/** Land in the last-used organization's week, or the first usable one, or /app/welcome. */
export default function AppHome() {
  const router = useRouter();
  const orgs = useOrgs();

  useEffect(() => {
    if (!orgs.data) return;
    let last: string | null = null;
    try {
      last = localStorage.getItem(LAST_ORG_KEY);
    } catch {
      // ignore
    }
    const usable = orgs.data.filter((o) => !o.suspended);
    const target = usable.find((o) => o.id === last) ?? usable[0];
    router.replace(target ? `/app/${target.id}/week` : "/app/welcome");
  }, [orgs.data, router]);

  if (orgs.error) {
    return (
      <div className="mx-auto max-w-xl p-6">
        <ErrorState error={orgs.error} onRetry={() => orgs.refetch()} />
      </div>
    );
  }
  return <PageLoader label="Opening your week…" />;
}
