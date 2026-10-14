import { createClerkClient, type ClerkClient, type OrganizationMembership, type User } from "@clerk/express";
import type { OrgRole } from "@floppy/shared";
import type { IdentityInvitation, IdentityMembership, IdentityProvider, IdentityUser } from "../ports.js";

/**
 * Clerk roles stay at the two defaults (`org:admin`, `org:member`). The exact
 * Floppy role (owner/admin/member) lives in the membership's public metadata,
 * which only the backend can write.
 */
const clerkRoleFor = (role: OrgRole) => (role === "member" ? "org:member" : "org:admin");

function roleOf(m: Pick<OrganizationMembership, "role" | "publicMetadata">): OrgRole {
  const meta = (m.publicMetadata ?? {}) as { role?: string };
  if (meta.role === "owner" || meta.role === "admin" || meta.role === "member") return meta.role;
  return m.role === "org:admin" ? "admin" : "member";
}

function toUser(u: User): IdentityUser {
  const email =
    u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId)?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? "";
  const phone =
    u.phoneNumbers.find((p) => p.id === u.primaryPhoneNumberId)?.phoneNumber ?? u.phoneNumbers[0]?.phoneNumber ?? null;
  const role = (u.publicMetadata as { platformRole?: string } | undefined)?.platformRole;
  return {
    id: u.id,
    email,
    firstName: u.firstName ?? "",
    lastName: u.lastName ?? "",
    imageUrl: u.imageUrl ?? null,
    phone,
    platformRole: role === "staff" || role === "superadmin" ? role : "none",
    banned: u.banned,
    createdAt: new Date(u.createdAt),
  };
}

function toMembership(m: OrganizationMembership): IdentityMembership {
  return {
    organizationId: m.organization.id,
    organizationName: m.organization.name,
    userId: m.publicUserData?.userId ?? "",
    role: roleOf(m),
    createdAt: new Date(m.createdAt),
  };
}

const isNotFound = (err: unknown) => (err as { status?: number })?.status === 404;

export class ClerkIdentity implements IdentityProvider {
  private readonly clerk: ClerkClient;

  constructor(secretKey: string, publishableKey: string) {
    this.clerk = createClerkClient({ secretKey, publishableKey });
  }

  async getUser(userId: string) {
    try {
      return toUser(await this.clerk.users.getUser(userId));
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async findUserByEmail(email: string) {
    const { data } = await this.clerk.users.getUserList({ emailAddress: [email], limit: 1 });
    return data[0] ? toUser(data[0]) : null;
  }

  async createUser(input: { email: string; firstName: string; lastName: string; password: string; platformRole?: IdentityUser["platformRole"] }) {
    const user = await this.clerk.users.createUser({
      emailAddress: [input.email],
      firstName: input.firstName,
      lastName: input.lastName,
      password: input.password,
      publicMetadata: { platformRole: input.platformRole ?? "none" },
    });
    return toUser(user);
  }

  async updateUser(userId: string, input: { firstName?: string; lastName?: string; password?: string }) {
    await this.clerk.users.updateUser(userId, {
      firstName: input.firstName,
      lastName: input.lastName,
      password: input.password,
      // An admin-set password should not be blocked by breach checks on a fresh, random value only.
      ...(input.password ? { signOutOfOtherSessions: true } : {}),
    });
  }

  async setPlatformRole(userId: string, role: IdentityUser["platformRole"]) {
    await this.clerk.users.updateUserMetadata(userId, { publicMetadata: { platformRole: role } });
  }

  async setBanned(userId: string, banned: boolean) {
    if (banned) await this.clerk.users.banUser(userId);
    else await this.clerk.users.unbanUser(userId);
  }

  async createOrganization(input: { name: string; createdBy: string }) {
    const org = await this.clerk.organizations.createOrganization({ name: input.name, createdBy: input.createdBy });
    return { id: org.id, name: org.name };
  }

  async renameOrganization(orgId: string, name: string) {
    await this.clerk.organizations.updateOrganization(orgId, { name });
  }

  async setOrganizationSuspended(orgId: string, suspended: boolean) {
    await this.clerk.organizations.updateOrganizationMetadata(orgId, { publicMetadata: { suspended } });
  }

  async deleteOrganization(orgId: string) {
    try {
      await this.clerk.organizations.deleteOrganization(orgId);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  async getMembership(orgId: string, userId: string) {
    try {
      const { data } = await this.clerk.organizations.getOrganizationMembershipList({ organizationId: orgId, userId: [userId], limit: 1 });
      return data[0] ? { ...toMembership(data[0]), userId } : null;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async listUserMemberships(userId: string) {
    const { data } = await this.clerk.users.getOrganizationMembershipList({ userId, limit: 100 });
    return data.map((m) => ({ ...toMembership(m), userId }));
  }

  async addMember(orgId: string, userId: string, role: OrgRole) {
    await this.clerk.organizations.createOrganizationMembership({ organizationId: orgId, userId, role: clerkRoleFor(role) });
    await this.clerk.organizations.updateOrganizationMembershipMetadata({ organizationId: orgId, userId, publicMetadata: { role } });
  }

  async setMemberRole(orgId: string, userId: string, role: OrgRole) {
    await this.clerk.organizations.updateOrganizationMembership({ organizationId: orgId, userId, role: clerkRoleFor(role) });
    await this.clerk.organizations.updateOrganizationMembershipMetadata({ organizationId: orgId, userId, publicMetadata: { role } });
  }

  async removeMember(orgId: string, userId: string) {
    try {
      await this.clerk.organizations.deleteOrganizationMembership({ organizationId: orgId, userId });
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }

  async createInvitation(input: { orgId: string; email: string; role: "admin" | "member"; inviterId: string; redirectUrl: string }) {
    const inv = await this.clerk.organizations.createOrganizationInvitation({
      organizationId: input.orgId,
      emailAddress: input.email,
      role: clerkRoleFor(input.role),
      inviterUserId: input.inviterId,
      redirectUrl: input.redirectUrl,
      expiresInDays: 14,
      publicMetadata: { role: input.role },
    });
    return toInvitation(inv);
  }

  async listPendingInvitations(orgId: string) {
    const { data } = await this.clerk.organizations.getOrganizationInvitationList({ organizationId: orgId, status: ["pending"], limit: 100 });
    return data.map(toInvitation);
  }

  async revokeInvitation(orgId: string, invitationId: string, requestingUserId: string) {
    await this.clerk.organizations.revokeOrganizationInvitation({ organizationId: orgId, invitationId, requestingUserId });
  }
}

function toInvitation(inv: {
  id: string;
  emailAddress: string;
  role: string;
  status?: string | null;
  createdAt: number;
  expiresAt?: number | null;
  url: string | null;
  publicMetadata?: unknown;
}): IdentityInvitation {
  const meta = (inv.publicMetadata ?? {}) as { role?: string };
  return {
    id: inv.id,
    email: inv.emailAddress,
    role: meta.role === "admin" || inv.role === "org:admin" ? "admin" : "member",
    status: inv.status ?? "pending",
    createdAt: new Date(inv.createdAt),
    expiresAt: inv.expiresAt ? new Date(inv.expiresAt) : null,
    url: inv.url,
  };
}
