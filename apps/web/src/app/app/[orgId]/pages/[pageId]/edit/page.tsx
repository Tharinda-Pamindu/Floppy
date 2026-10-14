"use client";

import type { PageDetail } from "@floppy/shared";
import { LIMITS } from "@floppy/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Save } from "lucide-react";
import { useRouter } from "next/navigation";
import { use, useEffect, useState } from "react";
import { Markdown } from "@/components/markdown";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Field, FormError, Input, Textarea } from "@/components/ui/field";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/misc";
import { ErrorState, PageLoader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { ApiError, errorMessage, useApi } from "@/lib/api";
import { keys } from "@/lib/queries";

export default function EditPage({ params }: { params: Promise<{ orgId: string; pageId: string }> }) {
  const { orgId, pageId } = use(params);
  const api = useApi();
  const toast = useToast();
  const router = useRouter();
  const queryClient = useQueryClient();
  const base = `/organizations/${orgId}/pages/${pageId}`;
  const page = useQuery({ queryKey: [...keys.pages(orgId), pageId, "edit"], queryFn: () => api<PageDetail>(base), retry: false, staleTime: Infinity });

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [note, setNote] = useState("");
  const [baseVersion, setBaseVersion] = useState(1);
  const [conflict, setConflict] = useState(false);

  useEffect(() => {
    if (page.data) {
      setTitle(page.data.title);
      setBody(page.data.bodyMd);
      setBaseVersion(page.data.currentVersion);
    }
  }, [page.data]);

  const bytes = new TextEncoder().encode(body).length;
  const save = useMutation({
    mutationFn: (version: number) => api<PageDetail>(base, { method: "PUT", json: { title, bodyMd: body, baseVersion: version, changeNote: note } }),
    onSuccess: (p) => {
      void queryClient.invalidateQueries({ queryKey: keys.pages(orgId) });
      toast.ok(`Saved version ${p.version}.`);
      router.push(`/app/${orgId}/pages/${pageId}`);
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === "PAGE_VERSION_CONFLICT") setConflict(true);
    },
  });

  async function saveOnTop() {
    const latest = await api<PageDetail>(base);
    setConflict(false);
    setBaseVersion(latest.currentVersion);
    save.mutate(latest.currentVersion);
  }

  async function loadTheirs() {
    const latest = await api<PageDetail>(base);
    setTitle(latest.title);
    setBody(latest.bodyMd);
    setBaseVersion(latest.currentVersion);
    setConflict(false);
  }

  if (page.isLoading) return <PageLoader />;
  if (page.error || !page.data) return <ErrorState error={page.error} onRetry={() => page.refetch()} />;
  if (!page.data.canEdit) return <ErrorState error={new ApiError(403, "PAGE_EDITOR_REQUIRED", "Only owners, admins and the team's lead can edit this page.")} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-display text-2xl font-bold">Editing</h1>
        <span className="font-mono text-xs text-muted">based on v{baseVersion}</span>
        <div className="ml-auto flex gap-2">
          <Button variant="ghost" onClick={() => router.push(`/app/${orgId}/pages/${pageId}`)}>Cancel</Button>
          <Button onClick={() => save.mutate(baseVersion)} loading={save.isPending} disabled={!title.trim() || bytes > LIMITS.pageBodyMaxBytes}><Save className="h-4 w-4" />Save new version</Button>
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-[1fr_320px]">
        <Field label="Title" htmlFor="pe-title"><Input id="pe-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={LIMITS.pageTitleMax} /></Field>
        <Field label="What changed? (optional)" htmlFor="pe-note"><Input id="pe-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={LIMITS.pageChangeNoteMax} placeholder="e.g. Added Q4 goals" /></Field>
      </div>
      <Tabs defaultValue="write">
        <TabsList className="lg:hidden">
          <TabsTrigger value="write">Write</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <div className="grid gap-4 lg:grid-cols-2">
          <TabsContent value="write" forceMount className="data-[state=inactive]:hidden lg:data-[state=inactive]:block">
            <Textarea aria-label="Markdown" value={body} onChange={(e) => setBody(e.target.value)} className="min-h-[60vh] font-mono text-sm" spellCheck />
            <p className={`mt-1 text-right font-mono text-xs ${bytes > LIMITS.pageBodyMaxBytes ? "text-danger" : "text-muted"}`}>{(bytes / 1024).toFixed(1)} / 200 KB · Markdown with tables and checklists</p>
          </TabsContent>
          <TabsContent value="preview" forceMount className="data-[state=inactive]:hidden lg:data-[state=inactive]:block">
            <div className="label-card-flat min-h-[60vh] overflow-auto px-5 py-4"><Markdown>{body || "_Nothing to preview yet._"}</Markdown></div>
          </TabsContent>
        </div>
      </Tabs>
      <FormError message={save.error && !(save.error instanceof ApiError && save.error.code === "PAGE_VERSION_CONFLICT") ? errorMessage(save.error) : null} />

      <Dialog
        open={conflict}
        onOpenChange={setConflict}
        title="Someone saved while you were editing"
        description="Nothing is lost yet. Choose what to do with your edits."
        footer={
          <>
            <Button variant="outline" onClick={loadTheirs}>Load their version (discard mine)</Button>
            <Button onClick={saveOnTop}>Save mine as a new version</Button>
          </>
        }
      >
        <p className="text-sm text-ink-soft">Saving yours on top keeps their version in the history, so it can always be opened or downloaded later.</p>
      </Dialog>
    </div>
  );
}
