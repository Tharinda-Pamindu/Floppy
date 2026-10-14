"use client";

import type {
  AssignedTask,
  Conversation,
  Member,
  MeResponse,
  OrganizationDetail,
  OrganizationSummary,
  PageSummary,
  Plan,
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

export function useMyTasks(orgId: string, scope: "mine" | "assigned_by_me" | "team") {
  const api = useApi();
  return useQuery({
    queryKey: [...keys.tasks(orgId), scope],
    queryFn: () => api<AssignedTask[]>(`/organizations/${orgId}/tasks?scope=${scope}`),
  });
}
