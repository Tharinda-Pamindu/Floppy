"use client";

import type {
  AssignedTask,
  Conversation,
  IssueType,
  Member,
  MeResponse,
  OrganizationDetail,
  OrganizationSummary,
  PageSummary,
  Plan,
  Priority,
  TaskEvent,
  Team,
} from "@floppy/shared";
import { useQuery } from "@tanstack/react-query";
import { useApi } from "./api";

/** Query keys, so mutations can invalidate precisely. */
export const keys = {
  me: ["me"] as const,
  orgs: ["orgs"] as const,
  org: (orgId: string) => ["org", orgId] as const,
  members: (orgId: string) => ["org", orgId, "members"] as const,
  teams: (orgId: string) => ["org", orgId, "teams"] as const,
  team: (orgId: string, teamId: string) => ["org", orgId, "teams", teamId] as const,
  plans: (orgId: string) => ["org", orgId, "plans"] as const,
  plan: (orgId: string, planId: string) => ["org", orgId, "plan", planId] as const,
  approvals: (orgId: string) => ["org", orgId, "approvals"] as const,
  tasks: (orgId: string) => ["org", orgId, "tasks"] as const,
  conversations: (orgId: string) => ["org", orgId, "conversations"] as const,
  pages: (orgId: string) => ["org", orgId, "pages"] as const,
  aiStatus: ["ai-status"] as const,
};

export function useMe() {
  const api = useApi();
  return useQuery({ queryKey: keys.me, queryFn: () => api<MeResponse>("/me"), staleTime: 60_000 });
}

export function useOrgs() {
  const api = useApi();
  return useQuery({ queryKey: keys.orgs, queryFn: () => api<OrganizationSummary[]>("/organizations") });
}

export function useOrg(orgId: string) {
  const api = useApi();
  return useQuery({ queryKey: keys.org(orgId), queryFn: () => api<OrganizationDetail>(`/organizations/${orgId}`), retry: false });
}

export function useMembers(orgId: string) {
  const api = useApi();
  return useQuery({ queryKey: keys.members(orgId), queryFn: () => api<Member[]>(`/organizations/${orgId}/members`) });
}

export function useTeams(orgId: string) {
  const api = useApi();
  return useQuery({ queryKey: keys.teams(orgId), queryFn: () => api<Team[]>(`/organizations/${orgId}/teams`) });
}

export function useApprovals(orgId: string) {
  const api = useApi();
  return useQuery({
    queryKey: keys.approvals(orgId),
    queryFn: () => api<Plan[]>(`/organizations/${orgId}/approvals`),
    refetchInterval: 60_000,
  });
}

export function useConversations(orgId: string) {
  const api = useApi();
  return useQuery({ queryKey: keys.conversations(orgId), queryFn: () => api<Conversation[]>(`/organizations/${orgId}/conversations`) });
}

export function usePages(orgId: string) {
  const api = useApi();
  return useQuery({ queryKey: keys.pages(orgId), queryFn: () => api<PageSummary[]>(`/organizations/${orgId}/pages`) });
}

export function useAiStatus() {
  const api = useApi();
  return useQuery({
    queryKey: keys.aiStatus,
    queryFn: () => api<{ enabled: boolean; model: string | null }>("/ai/status"),
    staleTime: 10 * 60_000,
  });
}

export type TaskScope = "mine" | "assigned_by_me" | "team";
/** What the list, board and calendar ask for: a scope plus the filter bar (and a deadline window for the calendar). */
export interface TaskQuery {
  scope: TaskScope;
  q?: string;
  assigneeId?: string;
  type?: IssueType;
  priority?: Priority;
  label?: string;
  from?: string;
  to?: string;
}

export function useTasks(orgId: string, query: TaskQuery) {
  const api = useApi();
  const params = new URLSearchParams(Object.entries(query).filter((e): e is [string, string] => !!e[1]));
  return useQuery({
    queryKey: [...keys.tasks(orgId), "list", query],
    queryFn: () => api<AssignedTask[]>(`/organizations/${orgId}/tasks?${params}`),
    placeholderData: (previous) => previous,
  });
}

export function useTaskActivity(orgId: string, taskId: string) {
  const api = useApi();
  return useQuery({
    queryKey: [...keys.tasks(orgId), taskId, "activity"],
    queryFn: () => api<TaskEvent[]>(`/organizations/${orgId}/tasks/${taskId}/activity`),
  });
}
