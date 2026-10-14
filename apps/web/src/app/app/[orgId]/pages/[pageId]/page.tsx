"use client";

import type { PageDetail, PageVersionSummary } from "@floppy/shared";
import { LIMITS } from "@floppy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, Download, FileUp, History, Pencil } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useRef } from "react";
import { Markdown } from "@/components/markdown";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ErrorState, PageLoader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { downloadFrom } from "@/lib/download";
import { keys } from "@/lib/queries";
import { cn, formatDateTime, fullName } from "@/lib/utils";

function PageView({ orgId, pageId }: { orgId: string; pageId: string }) {
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const params = useSearchParams();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const version = params.get("version");
  const base = `/organizations/${orgId}/pages/${pageId}`;

  const page = useQuery({
    queryKey: [...keys.pages(orgId), pageId, version ?? "current"],
    queryFn: () => api<PageDetail>(version ? `${base}/versions/${version}` : base),
    retry: false,
  });
  const versions = useQuery({ queryKey: [...keys.pages(orgId), pageId, "versions"], queryFn: () => api<PageVersionSummary[]>(`${base}/versions`) });

  const refresh = () => queryClient.invalidateQueries({ queryKey: keys.pages(orgId) });

  const importMd = useMutation({
    mutationFn: async (file: File) => {
      if (file.size > LIMITS.pageBodyMaxBytes) throw new Error("That file is over 200 KB.");
      if (!/\.(md|markdown|txt)$/i.test(file.name)) throw new Error("Choose a .md file.");
      const current = page.data!.currentVersion;
      return api<PageDetail>(`${base}/import?baseVersion=${current}&fileName=${encodeURIComponent(file.name)}`, {
        method: "POST",
        headers: { "Content-Type": "text/markdown" },
        body: await file.arrayBuffer(),
      });
    },
    onSuccess: (p) => { void refresh(); toast.ok(`Imported as version ${p.version}.`); router.replace(`/app/${orgId}/pages/${pageId}`); },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const archive = useMutation({
    mutationFn: () => api(base, { method: "DELETE" }),
    onSuccess: () => { void refresh(); router.push(`/app/${orgId}/pages`); },
    onError: (e) => toast.error(errorMessage(e)),
  });

  if (page.isLoading) return <PageLoader />;
  if (page.error || !page.data) return <ErrorState error={page.error} onRetry={() => page.refetch()} />;
  const p = page.data;
  const old = p.version !== p.currentVersion;

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <article className="min-w-0">
        <div className="mb-4 flex flex-wrap items-center gap-2 font-mono text-xs text-muted">
          <Link href={`/app/${orgId}/pages`} className="hover:text-accent">Pages</Link>
          <span>/</span>
          <span>{p.teamName ?? "Organization"}</span>
          <Badge tone={old ? "warn" : "accent"}>v{p.version}{old ? ` of ${p.currentVersion}` : ""}</Badge>
        </div>
        {old && (
          <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-warn bg-warn-soft px-4 py-2.5 text-sm">
            You&apos;re reading version {p.version}{p.changeNote ? ` — “${p.changeNote}”` : ""}. It&apos;s read-only.
            <Link href={`/app/${orgId}/pages/${pageId}`} className="font-semibold text-accent">Go to the latest →</Link>
          </div>
        )}
        <div className="label-card px-5 py-4 sm:px-8 sm:py-6">
          {p.bodyMd.trim() ? <Markdown>{p.bodyMd}</Markdown> : <p className="text-muted">This page is empty.</p>}
        </div>
        {p.children.length > 0 && (
          <div className="mt-4">
            <h2 className="mb-2 text-xs font-semibold tracking-wider text-muted uppercase">Sub-pages</h2>
            <ul className="flex flex-wrap gap-2">{p.children.map((c) => <li key={c.id}><Link href={`/app/${orgId}/pages/${c.id}`} className="rounded-full border border-rule-soft px-3 py-1 text-sm font-medium hover:border-rule">{c.title}</Link></li>)}</ul>
          </div>
        )}
      </article>

      <aside className="space-y-4">
        <div className="label-card-flat space-y-2 p-3">
          {p.canEdit && !old && <Button asChild className="w-full"><Link href={`/app/${orgId}/pages/${pageId}/edit`}><Pencil className="h-4 w-4" />Edit</Link></Button>}
          <Button variant="outline" className="w-full" onClick={() => downloadFrom(api, `${base}/export?version=${p.version}`, `${p.slug}-v${p.version}.md`).catch((e) => toast.error(errorMessage(e)))}>
            <Download className="h-4 w-4" />Download v{p.version} (.md)
          </Button>
          {p.canEdit && (
            <>
              <input ref={fileRef} type="file" accept=".md,.markdown,text/markdown,text/plain" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) importMd.mutate(f); e.target.value = ""; }} />
              <Button variant="outline" className="w-full" loading={importMd.isPending} onClick={() => fileRef.current?.click()}><FileUp className="h-4 w-4" />Import .md as new version</Button>
              <Button variant="ghost" className="w-full text-danger" onClick={() => archive.mutate()} loading={archive.isPending}><Archive className="h-4 w-4" />Archive page</Button>
            </>
          )}
        </div>
        <div className="label-card-flat p-3">
          <h2 className="mb-2 flex items-center gap-2 font-display font-bold"><History className="h-4 w-4 text-accent" />History</h2>
          <ol className="space-y-1">
            {(versions.data ?? []).map((v) => (
              <li key={v.version}>
                <Link
                  href={v.version === p.currentVersion ? `/app/${orgId}/pages/${pageId}` : `/app/${orgId}/pages/${pageId}?version=${v.version}`}
                  className={cn("block rounded-lg px-2 py-1.5 text-sm hover:bg-surface-2", v.version === p.version && "bg-accent-soft")}
                >
                  <div className="flex items-center gap-2"><span className="font-mono text-xs font-bold">v{v.version}</span><span className="truncate">{v.changeNote ?? "No note"}</span></div>
                  <div className="font-mono text-[11px] text-muted">{fullName(v.author)} · {formatDateTime(v.createdAt)}</div>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </aside>
    </div>
  );
}

export default function PagePage({ params }: { params: Promise<{ orgId: string; pageId: string }> }) {
  const { orgId, pageId } = use(params);
  return (
    <Suspense fallback={<PageLoader />}>
      <PageView orgId={orgId} pageId={pageId} />
    </Suspense>
  );
}
