/**
 * The outside services the API talks to, as small interfaces. Production
 * wires in Clerk, Novu, GitHub and an OpenAI-compatible AI client; tests wire
 * in in-memory fakes (test/fakes.ts). Services never import an SDK directly.
 */
import type { InboxSession, NotificationPreferences, OrgRole } from "@floppy/shared";
import type { z } from "zod";

// -- Identity (Clerk) ----------------------------------------------------------

export interface IdentityUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  imageUrl: string | null;
  phone: string | null;
  platformRole: "none" | "staff" | "superadmin";
  banned: boolean;
  createdAt: Date;
}

export interface IdentityMembership {
  organizationId: string;
  organizationName: string;
  userId: string;
  role: OrgRole;
  createdAt: Date;
}

export interface IdentityInvitation {
  id: string;
  email: string;
  role: "admin" | "member";
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
  url: string | null;
}

export interface IdentityProvider {
  getUser(userId: string): Promise<IdentityUser | null>;
  findUserByEmail(email: string): Promise<IdentityUser | null>;
  createUser(input: {
    email: string;
    firstName: string;
    lastName: string;
    password: string;
    platformRole?: "none" | "staff" | "superadmin";
  }): Promise<IdentityUser>;
  updateUser(userId: string, input: { firstName?: string; lastName?: string; password?: string }): Promise<void>;
  setPlatformRole(userId: string, role: "none" | "staff" | "superadmin"): Promise<void>;
  /** Ban ends every session and blocks sign-in; unban restores it. */
  setBanned(userId: string, banned: boolean): Promise<void>;

  createOrganization(input: { name: string; createdBy: string }): Promise<{ id: string; name: string }>;
  renameOrganization(orgId: string, name: string): Promise<void>;
  setOrganizationSuspended(orgId: string, suspended: boolean): Promise<void>;
  deleteOrganization(orgId: string): Promise<void>;
  getMembership(orgId: string, userId: string): Promise<IdentityMembership | null>;
  listUserMemberships(userId: string): Promise<IdentityMembership[]>;
  addMember(orgId: string, userId: string, role: OrgRole): Promise<void>;
  setMemberRole(orgId: string, userId: string, role: OrgRole): Promise<void>;
  removeMember(orgId: string, userId: string): Promise<void>;
  createInvitation(input: {
    orgId: string;
    email: string;
    role: "admin" | "member";
    inviterId: string;
    redirectUrl: string;
  }): Promise<IdentityInvitation>;
  listPendingInvitations(orgId: string): Promise<IdentityInvitation[]>;
  revokeInvitation(orgId: string, invitationId: string, requestingUserId: string): Promise<void>;
}

// -- Notifications (Novu) ---------------------------------------------------------

export type WorkflowId =
  | "welcome"
  | "auth-verification-code"
  | "auth-password-reset"
  | "org-invitation"
  | "member-joined"
  | "plan-submitted"
  | "approval-overdue"
  | "plan-approved"
  | "plan-changes-requested"
  | "team-lead-assigned"
  | "weekly-plan-reminder"
  | "week-close-reminder"
  | "org-suspended"
  | "org-reinstated"
  | "task-assigned"
  | "task-updated"
  | "task-completed"
  | "task-deadline-reminder"
  | "task-overdue"
  | "chat-message"
  | "chat-mention"
  | "page-updated"
  | "org-deletion-requested"
  | "org-deletion-decided"
  | "account-suspended"
  | "test-notification";

export interface SubscriberProfile {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  timezone: string | null;
}

export interface Notifier {
  readonly enabled: boolean;
  /** Never throws: notification failures are logged, not surfaced to the user. */
  trigger(
    workflowId: WorkflowId,
    to: string | string[],
    payload: Record<string, unknown>,
    options?: { transactionId?: string },
  ): Promise<void>;
  /**
   * Trigger to someone who may not be a subscriber yet (e.g. a sign-up
   * verification code), identified by email or phone only.
   */
  triggerInline(
    workflowId: WorkflowId,
    to: { subscriberId: string; email?: string; phone?: string },
    payload: Record<string, unknown>,
  ): Promise<void>;
  upsertSubscriber(profile: SubscriberProfile): Promise<void>;
  deleteSubscriber(subscriberId: string): Promise<void>;
  getPreferences(subscriberId: string): Promise<NotificationPreferences>;
  updatePreferences(
    subscriberId: string,
    input: { workflowId?: string; channels: { email?: boolean; sms?: boolean; inApp?: boolean } },
  ): Promise<void>;
  inboxSession(subscriberId: string): InboxSession | null;
}

// -- GitHub ---------------------------------------------------------------------

export interface GithubRepoInfo {
  owner: string;
  name: string;
  htmlUrl: string;
  private: boolean;
}

export interface GithubIssueInfo {
  number: number;
  title: string;
  state: "open" | "closed";
  url: string;
  labels: string[];
  author: string | null;
  createdAt: string;
}

export interface GithubClient {
  getRepo(owner: string, name: string): Promise<GithubRepoInfo | null>;
  listOpenIssues(owner: string, name: string, page: number): Promise<{ issues: GithubIssueInfo[]; hasMore: boolean }>;
  getIssue(owner: string, name: string, number: number): Promise<GithubIssueInfo | null>;
}

// -- AI -------------------------------------------------------------------------

export class AiProviderError extends Error {
  constructor(
    public readonly kind: "rate_limited" | "provider_http" | "unreachable" | "invalid_output" | "timeout",
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
  }
}

export interface AiProvider {
  readonly model: string;
  /** Ask for JSON matching `schema`. Throws AiProviderError on failure. */
  generateObject<T>(input: {
    system: string;
    prompt: string;
    schema: z.ZodType<T>;
    schemaName: string;
    temperature: number;
    signal: AbortSignal;
  }): Promise<{ object: T; inputTokens: number | null; outputTokens: number | null }>;
}

// -- Realtime (Socket.IO) -----------------------------------------------------------

export interface Realtime {
  toConversation(conversationId: string, event: string, data: unknown): void;
  toUser(userId: string, event: string, data: unknown): void;
}
