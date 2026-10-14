"use client";

import type { Conversation, Message, PersonRef } from "@floppy/shared";
import { LIMITS } from "@floppy/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { ArrowUp, MessagesSquare, Trash2 } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSocket } from "@/components/realtime";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/misc";
import { ErrorState, Spinner } from "@/components/ui/states";
import { useToast } from "@/components/ui/toast";
import { errorMessage, useApi } from "@/lib/api";
import { keys, useMe } from "@/lib/queries";
import { cn, formatDateTime, fullName } from "@/lib/utils";

type Page = { items: Message[]; hasMore: boolean };

const TOKEN = /(<@[A-Za-z0-9_]{1,64}>|https?:\/\/[^\s<]+)/g;

/** Renders plain text safely: mentions become chips, URLs become links. No HTML is ever injected. */
export function MessageBody({ body, people }: { body: string; people: Map<string, PersonRef> }) {
  const parts = body.split(TOKEN);
  return (
    <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">
      {parts.map((part, i) => {
        const mention = /^<@([A-Za-z0-9_]{1,64})>$/.exec(part);
        if (mention) {
          const p = people.get(mention[1]!);
          return <span key={i} className="rounded bg-accent-soft px-1 font-semibold text-accent">@{p ? fullName(p) : "someone"}</span>;
        }
        if (/^https?:\/\//.test(part)) {
          return <a key={i} href={part} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline underline-offset-2">{part}</a>;
        }
        return <Fragment key={i}>{part}</Fragment>;
      })}
    </p>
  );
}

/** Loads (and creates on first use) the conversation behind `path`, then shows the thread. */
export function ThreadFor({ orgId, path, title, compact }: { orgId: string; path: string; title?: ReactNode; compact?: boolean }) {
  const api = useApi();
  const conv = useQuery({ queryKey: ["conversation-for", path], queryFn: () => api<Conversation>(path) });
  if (conv.isLoading) return <div className="grid h-40 place-items-center"><Spinner /></div>;
  if (conv.error || !conv.data) return <ErrorState error={conv.error} onRetry={() => conv.refetch()} />;
  return <Thread orgId={orgId} conversation={conv.data} title={title} compact={compact} />;
}

export function Thread({ orgId, conversation, title, compact }: { orgId: string; conversation: Conversation; title?: ReactNode; compact?: boolean }) {
  const api = useApi();
  const toast = useToast();
  const me = useMe();
  const socket = useSocket();
  const queryClient = useQueryClient();
  const listRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState("");
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Map<string, string>>(new Map()); // "@Name" → user id
  const qk = useMemo(() => ["messages", conversation.id] as const, [conversation.id]);
  const base = `/organizations/${orgId}/conversations/${conversation.id}`;

  const messages = useInfiniteQuery({
    queryKey: qk,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => api<Page>(`${base}/messages?limit=40${pageParam ? `&before=${encodeURIComponent(pageParam)}` : ""}`),
    getNextPageParam: (last) => (last.hasMore ? last.items[0]?.createdAt : undefined),
  });

  const all = useMemo(() => [...(messages.data?.pages ?? [])].reverse().flatMap((p) => p.items), [messages.data]);
  const people = useMemo(() => {
    const m = new Map<string, PersonRef>();
    for (const p of conversation.participants) m.set(p.id, p);
    for (const msg of all) if (msg.author) m.set(msg.author.id, msg.author);
    return m;
  }, [conversation.participants, all]);

  const markRead = useMutation({
    mutationFn: () => api(`${base}/read`, { method: "POST" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: keys.conversations(orgId) }),
  });

  // Realtime: join the room, append new messages, drop deleted ones.
  useEffect(() => {
    if (!socket) return;
    const join = () => socket.emit("conversation:join", { organizationId: orgId, conversationId: conversation.id });
    join();
    socket.on("connect", join);
    const onNew = (m: Message) => {
      if (m.conversationId !== conversation.id) return;
      queryClient.setQueryData<InfiniteData<Page>>(qk, (data) => {
        if (!data || data.pages[0]?.items.some((x) => x.id === m.id)) return data;
        const [first, ...rest] = data.pages;
        return { ...data, pages: [{ ...first!, items: [...first!.items, m] }, ...rest] };
      });
      if (document.visibilityState === "visible") markRead.mutate();
    };
    const onDeleted = (e: { id: string; conversationId: string }) => {
      if (e.conversationId !== conversation.id) return;
      queryClient.setQueryData<InfiniteData<Page>>(qk, (data) =>
        data ? { ...data, pages: data.pages.map((p) => ({ ...p, items: p.items.map((x) => (x.id === e.id ? { ...x, deleted: true, body: "" } : x)) })) } : data,
      );
    };
    socket.on("message:new", onNew);
    socket.on("message:deleted", onDeleted);
    return () => {
      socket.emit("conversation:leave", { conversationId: conversation.id });
      socket.off("connect", join);
      socket.off("message:new", onNew);
      socket.off("message:deleted", onDeleted);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, conversation.id, orgId]);

  useEffect(() => {
    markRead.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversation.id]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [all.length]);

  const send = useMutation({
    mutationFn: (body: string) => api<Message>(`${base}/messages`, { method: "POST", json: { body } }),
    onSuccess: (m) => {
      setDraft("");
      setChosen(new Map());
      queryClient.setQueryData<InfiniteData<Page>>(qk, (data) => {
        if (!data || data.pages[0]?.items.some((x) => x.id === m.id)) return data;
        const [first, ...rest] = data.pages;
        return { ...data, pages: [{ ...first!, items: [...first!.items, m] }, ...rest] };
      });
    },
    onError: (e) => toast.error(errorMessage(e)),
  });

  const remove = useMutation({
    mutationFn: (id: string) => api(`${base}/messages/${id}`, { method: "DELETE" }),
    onError: (e) => toast.error(errorMessage(e)),
  });

  function submit() {
    let body = draft.trim();
    if (!body) return;
    // Turn chosen "@Name" mentions into tokens the server understands.
    for (const [label, id] of chosen) body = body.split(label).join(`<@${id}>`);
    send.mutate(body);
  }

  const candidates = mentionQuery !== null
    ? conversation.participants.filter((p) => p.id !== me.data?.id && fullName(p).toLowerCase().includes(mentionQuery.toLowerCase())).slice(0, 6)
    : [];

  function onDraftChange(value: string) {
    setDraft(value);
    const m = /(?:^|\s)@([\w ]{0,30})$/.exec(value);
    setMentionQuery(m ? m[1]! : null);
  }

  function pickMention(p: PersonRef) {
    const label = `@${fullName(p)}`;
    setDraft((d) => d.replace(/@([\w ]{0,30})$/, `${label} `));
    setChosen((c) => new Map(c).set(label, p.id));
    setMentionQuery(null);
  }

  return (
    <div className={cn("flex flex-col", compact ? "h-[420px]" : "h-[calc(100dvh-14rem)] min-h-[420px]")}>
      {title && <div className="border-b border-rule-soft px-4 py-3 font-display font-bold">{title}</div>}
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto px-4 py-4" aria-live="polite">
        {messages.hasNextPage && (
          <div className="text-center"><Button size="sm" variant="ghost" onClick={() => messages.fetchNextPage()} loading={messages.isFetchingNextPage}>Load earlier messages</Button></div>
        )}
        {messages.isLoading && <div className="grid h-full place-items-center"><Spinner /></div>}
        {messages.error && <ErrorState error={messages.error} onRetry={() => messages.refetch()} />}
        {!messages.isLoading && all.length === 0 && (
          <div className="grid h-full place-items-center text-center text-sm text-muted">
            <div><MessagesSquare className="mx-auto mb-2 h-6 w-6" />No messages yet. Say hello.</div>
          </div>
        )}
        {all.map((m) => {
          const mine = m.author?.id === me.data?.id;
          return (
            <div key={m.id} className="group flex gap-3">
              <Avatar person={m.author} size={32} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="text-sm font-bold">{m.author ? fullName(m.author) : "Former member"}</span>
                  <span className="font-mono text-[11px] text-muted">{formatDateTime(m.createdAt)}</span>
                  {mine && !m.deleted && (
                    <button onClick={() => remove.mutate(m.id)} className="ml-auto text-muted opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-danger" aria-label="Delete message">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
                {m.deleted ? <p className="text-sm text-muted italic">Message deleted</p> : <MessageBody body={m.body} people={people} />}
              </div>
            </div>
          );
        })}
      </div>
      <div className="relative border-t border-rule-soft p-3">
        {candidates.length > 0 && (
          <ul className="label-card absolute bottom-full left-3 z-10 mb-2 w-64 p-1" role="listbox" aria-label="Mention someone">
            {candidates.map((p) => (
              <li key={p.id}>
                <button onClick={() => pickMention(p)} className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-surface-2">
                  <Avatar person={p} size={22} /> {fullName(p)}
                </button>
              </li>
            ))}
          </ul>
        )}
        <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="flex items-end gap-2">
          <textarea
            aria-label="Message"
            value={draft}
            maxLength={LIMITS.messageMax}
            onChange={(e) => onDraftChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            rows={1}
            placeholder="Write a message — @ to mention, Shift+Enter for a new line"
            className="max-h-40 min-h-11 flex-1 resize-none rounded-xl border border-rule-soft bg-surface px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
          />
          <Button type="submit" size="icon" aria-label="Send" loading={send.isPending} disabled={!draft.trim()}><ArrowUp className="h-4 w-4" /></Button>
        </form>
      </div>
    </div>
  );
}
