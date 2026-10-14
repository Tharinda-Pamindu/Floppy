import type { Invite, Member, OrganizationDetail, OrganizationSummary, OrgRole } from "@floppy/shared";
import { DEFAULT_FIRST_TEAM_NAME } from "@floppy/shared";
import { and, count, eq, inArray } from "drizzle-orm";
import type { OrgContext } from "../auth/middleware.js";
import type { Deps } from "../context.js";
import {
  orgDeletionRequests,
  organizationMemberships,
  organizations,
  teamMemberships,
  teams,
  users,
} from "../db/schema.js";
import { AppError, conflict, forbidden, notFound } from "../errors.js";
import { logger } from "../logger.js";
import { displayName, iso, personRef } from "./people.js";
import { reconcileUserMemberships, type UserRow } from "./sync.js";

const LAST_OWNER = "An organization needs at least one owner. Make someone else an owner first.";

export async function listMyOrganizations(deps: Deps, user: UserRow): Promise<OrganizationSummary[]> {
  await reconcileUserMemberships(deps, user.id);
  const rows = await deps.db
    .select({ org: organizations, role: organizationMemberships.role })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(eq(organizationMemberships.userId, user.id))
    .orderBy(organizations.name);
  return rows.map(({ org, role }) => ({
    id: org.id,
    name: org.name,
    role: role as OrgRole,
    suspended: org.suspendedAt !== null,
  }));
}

/**
 * The creator becomes owner, and the organization starts with one team
 * (every organization has at least one), with the creator in it.
 */
export async function createOrganization(
  deps: Deps,
  user: UserRow,
  input: { name: string; firstTeamName?: string },
): Promise<OrganizationSummary> {
  const remote = await deps.identity.createOrganization({ name: input.name, createdBy: user.id });
  await deps.identity.setMemberRole(remote.id, user.id, "owner");
  await deps.db.transaction(async (tx) => {
    await tx.insert(organizations).values({ id: remote.id, name: input.name }).onConflictDoNothing();
    await tx
      .insert(organizationMemberships)
      .values({ organizationId: remote.id, userId: user.id, role: "owner" })
      .onConflictDoUpdate({
        target: [organizationMemberships.organizationId, organizationMemberships.userId],
        set: { role: "owner" },
      });
    const [team] = await tx
      .insert(teams)
      .values({ organizationId: remote.id, name: input.firstTeamName ?? DEFAULT_FIRST_TEAM_NAME })
      .onConflictDoNothing()
      .returning();
    if (team) {
      await tx.insert(teamMemberships).values({ organizationId: remote.id, teamId: team.id, userId: user.id });
    }
  });
  return { id: remote.id, name: input.name, role: "owner", suspended: false };
}

export async function getOrganizationDetail(deps: Deps, org: OrgContext): Promise<OrganizationDetail> {
  const [teamCount] = await deps.db.select({ n: count() }).from(teams).where(eq(teams.organizationId, org.organizationId));
  const [memberCount] = await deps.db
    .select({ n: count() })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.organizationId, org.organizationId));
  const [pending] = await deps.db
    .select()
    .from(orgDeletionRequests)
    .where(and(eq(orgDeletionRequests.organizationId, org.organizationId), eq(orgDeletionRequests.status, "pending")));
  return {
    id: org.organizationId,
    name: org.organization.name,
    role: org.role,
    suspended: org.organization.suspendedAt !== null,
    suspendedReason: org.organization.suspendedReason,
    isLead: org.ledTeamIds.length > 0,
    teamCount: teamCount?.n ?? 0,
    memberCount: memberCount?.n ?? 0,
    pendingDeletion:
      pending && org.isOwner ? { id: pending.id, reason: pending.reason, requestedAt: pending.createdAt.toISOString() } : null,
  };
}

export async function renameOrganization(deps: Deps, org: OrgContext, name: string) {
  await deps.identity.renameOrganization(org.organizationId, name);
  await deps.db.update(organizations).set({ name, updatedAt: deps.now() }).where(eq(organizations.id, org.organizationId));
}

export async function listMembers(deps: Deps, orgId: string): Promise<Member[]> {
  const rows = await deps.db
    .select({ m: organizationMemberships, u: users })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(eq(organizationMemberships.organizationId, orgId))
    .orderBy(users.firstName, users.lastName);
  return rows.map(({ m, u }) => ({ ...personRef(u), role: m.role as OrgRole, joinedAt: m.createdAt.toISOString() }));
}

async function getMember(deps: Deps, orgId: string, userId: string) {
  const [m] = await deps.db
    .select()
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, orgId), eq(organizationMemberships.userId, userId)));
  if (!m) throw notFound("Member not found");
  return m;
}

async function ensureNotLastOwner(deps: Deps, orgId: string) {
  const [owners] = await deps.db
    .select({ n: count() })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, orgId), eq(organizationMemberships.role, "owner")));
  if ((owners?.n ?? 0) <= 1) throw conflict(LAST_OWNER, "LAST_OWNER");
}

/** Owners set any role; org admins only move people between admin and member. */
export async function changeMemberRole(deps: Deps, org: OrgContext, actorId: string, targetUserId: string, role: OrgRole) {
  if (!org.isManager) throw forbidden("Only organization owners and admins can do this.", "ORG_ADMIN_REQUIRED");
  if (targetUserId === actorId) throw forbidden("You can't change your own role.", "SELF_ROLE_CHANGE");
  const target = await getMember(deps, org.organizationId, targetUserId);
  if (!org.isOwner && (target.role === "owner" || role === "owner")) {
    throw forbidden("Only an owner can grant or change the owner role.", "ORG_OWNER_REQUIRED");
  }
  if (target.role === "owner" && role !== "owner") await ensureNotLastOwner(deps, org.organizationId);
  await deps.identity.setMemberRole(org.organizationId, targetUserId, role);
  await deps.db
    .update(organizationMemberships)
    .set({ role, updatedAt: deps.now() })
    .where(eq(organizationMemberships.id, target.id));
}

export async function removeMember(deps: Deps, org: OrgContext, actorId: string, targetUserId: string) {
  if (!org.isManager) throw forbidden("Only organization owners and admins can do this.", "ORG_ADMIN_REQUIRED");
  if (targetUserId === actorId) throw forbidden("Use 'Leave organization' to remove yourself.", "SELF_REMOVE");
  const target = await getMember(deps, org.organizationId, targetUserId);
  if (!org.isOwner && target.role !== "member") {
    throw forbidden("Org admins can only remove members. Ask an owner.", "ORG_OWNER_REQUIRED");
  }
  if (target.role === "owner") await ensureNotLastOwner(deps, org.organizationId);
  await deps.identity.removeMember(org.organizationId, targetUserId);
  // Team memberships go with it through the composite foreign key.
  await deps.db.delete(organizationMemberships).where(eq(organizationMemberships.id, target.id));
}

export async function leaveOrganization(deps: Deps, org: OrgContext, userId: string) {
  if (org.isOwner) await ensureNotLastOwner(deps, org.organizationId);
  await deps.identity.removeMember(org.organizationId, userId);
  await deps.db
    .delete(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, org.organizationId), eq(organizationMemberships.userId, userId)));
}

// -- Invitations (Clerk sends the email) ---------------------------------------

export async function createInvite(
  deps: Deps,
  org: OrgContext,
  inviter: UserRow,
  input: { email: string; role: "admin" | "member" },
): Promise<Invite> {
  const [already] = await deps.db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(and(eq(organizationMemberships.organizationId, org.organizationId), eq(users.email, input.email)));
  if (already) throw conflict(`${input.email} is already a member of this organization.`, "ALREADY_MEMBER", "email");
  const invitation = await deps.identity.createInvitation({
    orgId: org.organizationId,
    email: input.email,
    role: input.role,
    inviterId: inviter.id,
    redirectUrl: `${deps.config.WEB_ORIGIN}/accept-invite`,
  });
  return toInvite(invitation);
}

export async function listInvites(deps: Deps, org: OrgContext): Promise<Invite[]> {
  return (await deps.identity.listPendingInvitations(org.organizationId)).map(toInvite);
}

export async function revokeInvite(deps: Deps, org: OrgContext, actorId: string, invitationId: string) {
  const pending = await deps.identity.listPendingInvitations(org.organizationId);
  if (!pending.some((i) => i.id === invitationId)) throw notFound("Invite not found");
  await deps.identity.revokeInvitation(org.organizationId, invitationId, actorId);
}

function toInvite(i: {
  id: string;
  email: string;
  role: "admin" | "member";
  status: string;
  createdAt: Date;
  expiresAt: Date | null;
  url: string | null;
}): Invite {
  return {
    id: i.id,
    email: i.email,
    role: i.role,
    status: i.status,
    createdAt: i.createdAt.toISOString(),
    expiresAt: iso(i.expiresAt),
    url: i.url,
  };
}

// -- Deletion requests (owner asks, super admin decides) ------------------------

export async function requestDeletion(deps: Deps, org: OrgContext, owner: UserRow, reason: string) {
  if (!org.isOwner) throw forbidden("Only an owner can ask to delete the organization.", "ORG_OWNER_REQUIRED");
  try {
    const [row] = await deps.db
      .insert(orgDeletionRequests)
      .values({
        organizationId: org.organizationId,
        organizationName: org.organization.name,
        requestedById: owner.id,
        reason,
      })
      .returning();
    const superadmins = await deps.db.select({ id: users.id }).from(users).where(eq(users.platformRole, "superadmin"));
    await deps.notifier.trigger(
      "org-deletion-requested",
      superadmins.map((s) => s.id),
      { organizationName: org.organization.name, requestedBy: displayName(owner), reason },
      { transactionId: `deletion-requested-${row!.id}` },
    );
    return row!;
  } catch (err) {
    if (isUniqueViolation(err)) {
      throw conflict("A deletion request for this organization is already waiting for review.", "DELETION_PENDING");
    }
    throw err;
  }
}

export async function cancelDeletionRequest(deps: Deps, org: OrgContext) {
  if (!org.isOwner) throw forbidden("Only an owner can cancel the deletion request.", "ORG_OWNER_REQUIRED");
  const updated = await deps.db
    .update(orgDeletionRequests)
    .set({ status: "cancelled", decidedAt: deps.now() })
    .where(and(eq(orgDeletionRequests.organizationId, org.organizationId), eq(orgDeletionRequests.status, "pending")))
    .returning();
  if (!updated.length) throw notFound("There is no pending deletion request.");
}

export function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: string; cause?: { code?: string } } | null;
  return e?.code === "23505" || e?.cause?.code === "23505";
}

/** Org members to notify (everyone, or only managers). */
export async function orgMemberIds(deps: Deps, orgId: string, roles?: OrgRole[]) {
  const rows = await deps.db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      roles
        ? and(eq(organizationMemberships.organizationId, orgId), inArray(organizationMemberships.role, roles))
        : eq(organizationMemberships.organizationId, orgId),
    );
  return rows.map((r) => r.userId);
}

export function logIdentityFailure(err: unknown, action: string): never {
  logger.error({ err, action }, "Identity provider call failed");
  throw new AppError(502, "IDENTITY_UNAVAILABLE", "We couldn't reach the sign-in service. Try again in a moment.");
}
