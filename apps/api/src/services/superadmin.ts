/**
 * The hidden super-admin surface: staff accounts, owner suspensions and
 * organization deletion requests. Every action lands in admin_audit_log.
 */
import { randomBytes } from "node:crypto";
import type { AuditEntry, DeletionRequest, OwnerRow, StaffUser } from "@floppy/shared";
import { and, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import type { Deps } from "../context.js";
import {
  adminAuditLog,
  assignedTasks,
  orgDeletionRequests,
  organizationMemberships,
  organizations,
  orgPages,
  teams,
  users,
  userSuspensions,
  weeklyPlans,
} from "../db/schema.js";
import { AppError, conflict, notFound } from "../errors.js";
import { logger } from "../logger.js";
import { displayName, iso, loadPeople, personRef } from "./people.js";
import { audit } from "./platform.js";
import { upsertUserMirror, type UserRow } from "./sync.js";

export function generatePassword(): string {
  // 18 random bytes → 24 url-safe characters; shown once, never stored by us.
  return randomBytes(18).toString("base64url");
}

// -- Staff accounts ------------------------------------------------------------------

export async function listStaff(deps: Deps): Promise<StaffUser[]> {
  const rows = await deps.db
    .select()
    .from(users)
    .where(inArray(users.platformRole, ["staff", "superadmin"]))
    .orderBy(users.firstName, users.lastName);
  return rows.map((u) => ({
    ...personRef(u),
    platformRole: u.platformRole as StaffUser["platformRole"],
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    isOwner: false,
  }));
}

export async function createStaff(deps: Deps, actor: UserRow, input: { firstName: string; lastName: string; email: string }) {
  const existing = await deps.identity.findUserByEmail(input.email);
  if (existing) throw conflict(`There's already an account for ${input.email}.`, "EMAIL_TAKEN", "email");
  const password = generatePassword();
  const created = await deps.identity.createUser({ ...input, password, platformRole: "staff" });
  const row = await upsertUserMirror(deps, created);
  await audit(deps, actor.id, "staff.create", "user", row.id);
  return { user: row, password };
}

export async function setStaffActive(deps: Deps, actor: UserRow, userId: string, active: boolean) {
  const [target] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!target || target.platformRole === "none") throw notFound("Staff member not found");
  if (target.id === actor.id) throw conflict("You can't deactivate your own account.", "SELF_DEACTIVATE");
  await deps.identity.setBanned(target.id, !active);
  await deps.db.update(users).set({ isActive: active, updatedAt: deps.now() }).where(eq(users.id, target.id));
  await audit(deps, actor.id, active ? "staff.reactivate" : "staff.deactivate", "user", target.id);
}

// -- Owners ----------------------------------------------------------------------------

export async function listOwners(deps: Deps): Promise<OwnerRow[]> {
  const rows = await deps.db
    .select({ u: users, orgId: organizations.id, orgName: organizations.name })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(eq(organizationMemberships.role, "owner"))
    .orderBy(users.firstName, users.lastName, organizations.name);
  const open = await deps.db.select().from(userSuspensions).where(isNull(userSuspensions.liftedAt));
  const openMap = new Map(open.map((s) => [s.userId, s]));
  const byUser = new Map<string, OwnerRow>();
  for (const { u, orgId, orgName } of rows) {
    let row = byUser.get(u.id);
    if (!row) {
      const s = openMap.get(u.id);
      row = {
        ...personRef(u),
        isActive: u.isActive,
        suspension: s ? { reason: s.reason, at: s.createdAt.toISOString() } : null,
        organizations: [],
      };
      byUser.set(u.id, row);
    }
    row.organizations.push({ id: orgId, name: orgName });
  }
  return [...byUser.values()];
}

/** Suspend an owner's whole account: Clerk ban ends every session and blocks sign-in. */
export async function suspendOwner(deps: Deps, actor: UserRow, userId: string, reason: string) {
  const [target] = await deps.db.select().from(users).where(eq(users.id, userId));
  const [ownership] = await deps.db
    .select({ n: count() })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.role, "owner")));
  if (!target || (ownership?.n ?? 0) === 0) throw notFound("Owner not found");
  if (target.id === actor.id) throw conflict("You can't suspend your own account.", "SELF_DEACTIVATE");
  const [open] = await deps.db
    .select()
    .from(userSuspensions)
    .where(and(eq(userSuspensions.userId, userId), isNull(userSuspensions.liftedAt)));
  if (open) throw conflict("This account is already suspended.", "ALREADY_SUSPENDED");
  await deps.identity.setBanned(userId, true);
  await deps.db.transaction(async (tx) => {
    await tx.insert(userSuspensions).values({ userId, reason, suspendedById: actor.id });
    await tx.update(users).set({ isActive: false, updatedAt: deps.now() }).where(eq(users.id, userId));
  });
  await audit(deps, actor.id, "owner.suspend", "user", userId, reason);
  await deps.notifier.trigger("account-suspended", userId, { firstName: target.firstName, reason, suspended: true });
}

export async function reinstateOwner(deps: Deps, actor: UserRow, userId: string) {
  const [open] = await deps.db
    .select()
    .from(userSuspensions)
    .where(and(eq(userSuspensions.userId, userId), isNull(userSuspensions.liftedAt)));
  if (!open) throw notFound("This account isn't suspended.");
  await deps.identity.setBanned(userId, false);
  await deps.db.transaction(async (tx) => {
    await tx.update(userSuspensions).set({ liftedAt: deps.now(), liftedById: actor.id }).where(eq(userSuspensions.id, open.id));
    await tx.update(users).set({ isActive: true, updatedAt: deps.now() }).where(eq(users.id, userId));
  });
  await audit(deps, actor.id, "owner.reinstate", "user", userId);
  const [target] = await deps.db.select().from(users).where(eq(users.id, userId));
  await deps.notifier.trigger("account-suspended", userId, {
    firstName: target?.firstName ?? "",
    reason: null,
    suspended: false,
    url: `${deps.config.WEB_ORIGIN}/app`,
  });
}

// -- Organization deletion requests ---------------------------------------------------

export async function listDeletionRequests(deps: Deps, status?: string): Promise<DeletionRequest[]> {
  const rows = await deps.db
    .select()
    .from(orgDeletionRequests)
    .where(status ? eq(orgDeletionRequests.status, status) : undefined)
    .orderBy(desc(orgDeletionRequests.createdAt))
    .limit(100);
  const people = await loadPeople(deps.db, rows.flatMap((r) => [r.requestedById, r.decidedById]));
  const result: DeletionRequest[] = [];
  for (const r of rows) {
    const counts = { members: 0, teams: 0, plans: 0, tasks: 0, pages: 0 };
    if (r.status === "pending") {
      const id = r.organizationId;
      counts.members = (await deps.db.select({ n: count() }).from(organizationMemberships).where(eq(organizationMemberships.organizationId, id)))[0]?.n ?? 0;
      counts.teams = (await deps.db.select({ n: count() }).from(teams).where(eq(teams.organizationId, id)))[0]?.n ?? 0;
      counts.plans = (await deps.db.select({ n: count() }).from(weeklyPlans).where(eq(weeklyPlans.organizationId, id)))[0]?.n ?? 0;
      counts.tasks = (await deps.db.select({ n: count() }).from(assignedTasks).where(eq(assignedTasks.organizationId, id)))[0]?.n ?? 0;
      counts.pages = (await deps.db.select({ n: count() }).from(orgPages).where(eq(orgPages.organizationId, id)))[0]?.n ?? 0;
    }
    result.push({
      id: r.id,
      organizationId: r.organizationId,
      organizationName: r.organizationName,
      requestedBy: r.requestedById ? (people.get(r.requestedById) ?? null) : null,
      reason: r.reason,
      status: r.status as DeletionRequest["status"],
      decidedBy: r.decidedById ? (people.get(r.decidedById) ?? null) : null,
      decisionNote: r.decisionNote,
      createdAt: r.createdAt.toISOString(),
      decidedAt: iso(r.decidedAt),
      counts,
    });
  }
  return result;
}

/**
 * Approve: permanently delete the organization from Clerk, then from the
 * database (cascading to teams, plans, tasks, chats, repos, pages and AI usage).
 * Reject: keep it, with a note to the owner.
 */
export async function decideDeletion(
  deps: Deps,
  actor: UserRow,
  requestId: string,
  input: { decision: "approve" | "reject"; note?: string | null },
) {
  const [request] = await deps.db.select().from(orgDeletionRequests).where(eq(orgDeletionRequests.id, requestId));
  if (!request) throw notFound("Request not found");
  if (request.status !== "pending") throw conflict(`This request was already ${request.status}.`, "REQUEST_DECIDED");

  const now = deps.now();
  if (input.decision === "approve") {
    try {
      await deps.identity.deleteOrganization(request.organizationId);
    } catch (err) {
      logger.error({ err, orgId: request.organizationId }, "Clerk organization delete failed");
      throw new AppError(502, "IDENTITY_UNAVAILABLE", "Clerk didn't delete the organization. Nothing was changed; try again.");
    }
    await deps.db.transaction(async (tx) => {
      await tx.delete(organizations).where(eq(organizations.id, request.organizationId));
      await tx
        .update(orgDeletionRequests)
        .set({ status: "approved", decidedById: actor.id, decisionNote: input.note ?? null, decidedAt: now })
        .where(eq(orgDeletionRequests.id, request.id));
    });
  } else {
    await deps.db
      .update(orgDeletionRequests)
      .set({ status: "rejected", decidedById: actor.id, decisionNote: input.note ?? null, decidedAt: now })
      .where(eq(orgDeletionRequests.id, request.id));
  }
  await audit(
    deps,
    actor.id,
    input.decision === "approve" ? "organization.delete" : "organization.delete_rejected",
    "organization",
    request.organizationId,
    input.note ?? request.reason,
    { organizationName: request.organizationName, requestId: request.id },
  );
  if (request.requestedById) {
    await deps.notifier.trigger("org-deletion-decided", request.requestedById, {
      organizationName: request.organizationName,
      approved: input.decision === "approve",
      note: input.note ?? null,
      decidedBy: displayName(actor),
    });
  }
}

export async function auditLog(deps: Deps, limit = 100): Promise<AuditEntry[]> {
  const rows = await deps.db.select().from(adminAuditLog).orderBy(desc(adminAuditLog.createdAt)).limit(limit);
  const people = await loadPeople(deps.db, rows.map((r) => r.actorId));
  return rows.map((r) => ({
    id: r.id,
    actor: r.actorId ? (people.get(r.actorId) ?? null) : null,
    action: r.action,
    targetType: r.targetType,
    targetId: r.targetId,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  }));
}

export { ne };
