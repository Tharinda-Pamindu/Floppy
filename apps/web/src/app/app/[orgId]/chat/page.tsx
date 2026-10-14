"use client";

import type { Conversation } from "@floppy/shared";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Hash, MessageSquarePlus, MessagesSquare } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, use, useState } from "react";
import { Thread } from "@/components/chat/thread";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui/misc";
import { EmptyState, ErrorState, PageLoader } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { keys, useConversations, useMe, useMembers } from "@/lib/queries";
import { cn, fullName, relativeTime } from "@/lib/utils";

function Chat({ orgId }: { orgId: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const conversations = useConversations(orgId);
  const selectedId = params.get("c");
  const list = conversations.data ?? [];
  const selected = list.find((c) => c.id === selectedId) ?? null;
  const open = (id: string | null) => router.replace(id ? `/app/${orgId}/chat?c=${id}` : `/app/${orgId}/chat`);

  if (conversations.isLoading) return <PageLoader />;
  if (conversations.error) return <ErrorState error={conversations.error} onRetry={() => conversations.refetch()} />;

  const channels = list.filter((c) => c.kind === "team");
  const dms = list.filter((c) => c.kind === "dm");

  return (
    <div className="label-card grid overflow-hidden md:grid-cols-[300px_1fr]">
      <aside className={cn("border-rule md:border-r-2", selected && "hidden md:block")}>
        <div className="flex items-center justify-between border-b-2 border-rule px-4 py-3">
          <h1 className="font-display text-xl font-extrabold">Chat</h1>
          <NewDm orgId={orgId} onOpen={(c) => open(c.id)} />
        </div>
        <nav className="max-h-[calc(100dvh-16rem)] overflow-y-auto p-2" aria-label="Conversations">
          <Group title="Team channels">
            {channels.length === 0 && <p className="px-2 py-1 text-sm text-muted">You&apos;re not on a team yet.</p>}
            {channels.map((c) => <Item key={c.id} c={c} active={c.id === selected?.id} onClick={() => open(c.id)} />)}
          </Group>
          <Group title="Direct messages">
            {dms.length === 0 && <p className="px-2 py-1 text-sm text-muted">No direct messages yet.</p>}
            {dms.map((c) => <Item key={c.id} c={c} active={c.id === selected?.id} onClick={() => open(c.id)} />)}
          </Group>
        </nav>
      </aside>
      <section className={cn(!selected && "hidden md:block")}>
        {selected ? (
          <>
            <div className="flex items-center gap-2 border-b-2 border-rule px-3 py-2.5">
              <Button variant="ghost" size="icon-sm" className="md:hidden" aria-label="Back to conversations" onClick={() => open(null)}><ArrowLeft className="h-4 w-4" /></Button>
              {selected.kind === "team" ? <Hash className="h-4 w-4 text-accent" /> : <Avatar person={selected.participants[0] ?? null} size={26} />}
              <h2 className="truncate font-display font-bold">{selected.title.replace(/^# /, "")}</h2>
            </div>
            <Thread key={selected.id} orgId={orgId} conversation={selected} />
          </>
        ) : (
          <div className="p-6"><EmptyState icon={<MessagesSquare className="h-6 w-6" />} title="Pick a conversation">Team channels are for everyone on the team. Direct messages are just between the two of you.</EmptyState></div>
        )}
      </section>
    </div>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-3">
      <div className="px-2 py-1.5 font-mono text-[10px] font-bold tracking-widest text-muted uppercase">{title}</div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

function Item({ c, active, onClick }: { c: Conversation; active: boolean; onClick: () => void }) {
  return (
    <li>
      <button onClick={onClick} aria-current={active ? "true" : undefined} className={cn("flex w-full items-center gap-2 rounded-xl px-2 py-2 text-left text-sm", active ? "bg-accent-soft font-semibold" : "hover:bg-surface-2")}>
        {c.kind === "team" ? <Hash className="h-4 w-4 shrink-0 text-accent" /> : <Avatar person={c.participants[0] ?? null} size={24} />}
        <span className={cn("min-w-0 flex-1 truncate", c.unread > 0 && "font-bold")}>{c.title.replace(/^# /, "")}</span>
        {c.unread > 0 ? (
          <span className="rounded-full bg-brand px-1.5 font-mono text-[10px] font-bold text-white">{c.unread}</span>
        ) : (
          c.lastMessageAt && <span className="font-mono text-[10px] text-muted">{relativeTime(c.lastMessageAt)}</span>
        )}
      </button>
    </li>
  );
}

function NewDm({ orgId, onOpen }: { orgId: string; onOpen: (c: Conversation) => void }) {
  const api = useApi();
  const toast = useToast();
  const me = useMe();
  const queryClient = useQueryClient();
  const members = useMembers(orgId);
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const start = useMutation({
    mutationFn: (userId: string) => api<Conversation>(`/organizations/${orgId}/conversations/dm`, { method: "POST", json: { userId } }),
    onSuccess: (c) => {
      void queryClient.invalidateQueries({ queryKey: keys.conversations(orgId) });
      setOpen(false);
      onOpen(c);
    },
    onError: (e) => toast.error(errorMessage(e)),
  });
  const people = (members.data ?? []).filter((m) => m.id !== me.data?.id && fullName(m).toLowerCase().includes(q.toLowerCase()));
  return (
    <Dialog open={open} onOpenChange={setOpen} title="New message" trigger={<Button size="icon-sm" variant="outline" aria-label="New direct message"><MessageSquarePlus className="h-4 w-4" /></Button>}>
      <input aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search people…" className="mb-3 h-10 w-full rounded-xl border-2 border-rule-soft bg-surface px-3 text-sm focus:border-accent focus:outline-none" />
      <ul className="max-h-80 space-y-1 overflow-y-auto">
        {people.map((m) => (
          <li key={m.id}>
            <button onClick={() => start.mutate(m.id)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-surface-2">
              <Avatar person={m} size={30} />
              <span className="min-w-0"><span className="block truncate font-semibold">{fullName(m)}</span><span className="block truncate text-xs text-muted">{m.email}</span></span>
            </button>
          </li>
        ))}
        {!people.length && <li className="px-2 py-2 text-sm text-muted">Nobody matches.</li>}
      </ul>
    </Dialog>
  );
}

export default function ChatPage({ params }: { params: Promise<{ orgId: string }> }) {
  const { orgId } = use(params);
  return (
    <Suspense fallback={<PageLoader />}>
      <Chat orgId={orgId} />
    </Suspense>
  );
}
