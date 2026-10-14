"use client";

import type { IssueType, Priority } from "@floppy/shared";
import { ISSUE_TYPES, LIMITS, PRIORITIES } from "@floppy/shared";
import { Search, X } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { type TaskQuery, type TaskScope, useMembers } from "@/lib/queries";
import { fullName } from "@/lib/utils";
import { TYPE_LABEL } from "./task-bits";

const FILTER_KEYS = ["q", "assignee", "type", "priority", "label"] as const;
const SCOPES: TaskScope[] = ["mine", "assigned_by_me", "team"];

/** The task views' state lives in the URL, so a filtered board or calendar can be shared or bookmarked. */
export function useTaskUrlState() {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const scopeParam = params.get("scope") as TaskScope | null;
  const query: TaskQuery = {
    scope: scopeParam && SCOPES.includes(scopeParam) ? scopeParam : "mine",
    q: params.get("q") ?? undefined,
    assigneeId: params.get("assignee") ?? undefined,
    type: (params.get("type") as IssueType | null) ?? undefined,
    priority: (params.get("priority") as Priority | null) ?? undefined,
    label: params.get("label") ?? undefined,
  };
  const set = (patch: Record<string, string | undefined>) => {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
  };
  const filtered = FILTER_KEYS.some((k) => params.get(k));
  const clear = () => set(Object.fromEntries(FILTER_KEYS.map((k) => [k, undefined])));
  return { query, params, set, filtered, clear };
}

/** Search, assignee, type, priority and label, shared by the list, board and calendar. */
export function TaskFilterBar({ orgId, knownLabels }: { orgId: string; knownLabels: string[] }) {
  const { query, set, filtered, clear } = useTaskUrlState();
  const members = useMembers(orgId);
  const labelListId = useId();
  const [q, setQ] = useState(query.q ?? "");
  const [label, setLabel] = useState(query.label ?? "");

  // Typing waits a moment before it filters, so each keystroke isn't a request.
  useEffect(() => {
    const timer = setTimeout(() => {
      // One URL update for both boxes, so neither overwrites the other.
      const patch: Record<string, string | undefined> = {};
      if ((query.q ?? "") !== q.trim()) patch.q = q.trim() || undefined;
      if ((query.label ?? "") !== label.trim().toLowerCase()) patch.label = label.trim().toLowerCase() || undefined;
      if (Object.keys(patch).length) set(patch);
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only the typed values should restart the wait
  }, [q, label]);

  // The Clear button empties the boxes. (Only on clear: syncing every URL change would eat letters still being typed.)
  useEffect(() => {
    if (!query.q) setQ("");
  }, [query.q]);
  useEffect(() => {
    if (!query.label) setLabel("");
  }, [query.label]);

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2" role="search" aria-label="Filter tasks">
      <div className="relative w-full sm:w-64">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input aria-label="Search tasks" placeholder="Search title or key (NORT-12)" value={q} onChange={(e) => setQ(e.target.value)} maxLength={LIMITS.taskSearchMax} className="pl-9" />
      </div>
      {query.scope !== "mine" && (
        <Select aria-label="Assignee" value={query.assigneeId ?? ""} onChange={(e) => set({ assignee: e.target.value || undefined })} className="w-auto">
          <option value="">Anyone</option>
          {(members.data ?? []).map((m) => <option key={m.id} value={m.id}>{fullName(m)}</option>)}
        </Select>
      )}
      <Select aria-label="Type" value={query.type ?? ""} onChange={(e) => set({ type: e.target.value || undefined })} className="w-auto">
        <option value="">All types</option>
        {ISSUE_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
      </Select>
      <Select aria-label="Priority" value={query.priority ?? ""} onChange={(e) => set({ priority: e.target.value || undefined })} className="w-auto">
        <option value="">Any priority</option>
        {PRIORITIES.map((p) => <option key={p} value={p}>{p[0]!.toUpperCase() + p.slice(1)}</option>)}
      </Select>
      <Input aria-label="Label" placeholder="Label" list={labelListId} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={LIMITS.labelMax} className="w-32" />
      <datalist id={labelListId}>{knownLabels.map((l) => <option key={l} value={l} />)}</datalist>
      {filtered && (
        <Button variant="ghost" size="sm" onClick={clear}><X className="h-3.5 w-3.5" />Clear</Button>
      )}
    </div>
  );
}
