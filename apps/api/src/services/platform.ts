/**
 * What platform staff see. Deliberately metadata only — counts, statuses,
 * timestamps, names, emails, roles, team names. Nothing here reads task text,
 * "why"s, review comments, AI output, chat messages or page content.
 */
import type {
  AiUsageByOrg,
  AiUsageEvent,
  OrgRole,
  StaffOrganization,
  StaffUser,
  StaffUserDetail,
} from "@floppy/shared";
import { and, count, desc, eq, gte, ilike, isNotNull, isNull, or, sql, type SQL } from "drizzle-orm";
import type { Deps } from "../context.js";
import {
  adminAuditLog,
  aiUsageEvents,
  organizationMemberships,
  organizations,
  teamMemberships,
  teams,
  users,
} from "../db/schema.js";
import { conflict, forbidden, notFound } from "../errors.js";
import { orgMemberIds } from "./orgs.js";
import { iso, personRef } from "./people.js";
import { upsertUserMirror, type UserRow } from "./sync.js";

const countIn = (table: string, alias = "o") =>
  sql<number>`(select count(*)::int from ${sql.raw(table)} x where x.organization_id = ${sql.raw(`${alias}.id`)})`;

function orgSelect() {
  return sql`
    select o.id, o.name, o.suspended_at, o.suspended_reason, o.created_at,
      ${countIn("organization_memberships")} as member_count,
      ${countIn("teams")} as team_count,
      ${countIn("weekly_plans")} as plan_count,
      ${countIn("assigned_tasks")} as task_count,
      (select count(*)::int from messages m join conversations c on c.id = m.conversation_id where c.organization_id = o.id) as message_count,
      ${countIn("org_pages")} as page_count,
      greatest(
        (select max(coalesce(p.updated_at, p.created_at)) from weekly_plans p where p.organization_id = o.id),
        (select max(a.created_at) from ai_usage_events a where a.organization_id = o.id),
        (select max(c.last_message_at) from conversations c where c.organization_id = o.id),
        o.created_at
      ) as last_active_at
    from organizations o`;
}

type OrgRowRaw = {
  id: string;
  name: string;
  suspended_at: string | Date | null;
  suspended_reason: string | null;
  created_at: string | Date;
  member_count: number;
  team_count: number;
  plan_count: number;
  task_count: number;
  message_count: number;
  page_count: number;
  last_active_at: string | Date;
};

const toIso = (v: string | Date | null) => (v === null ? null : new Date(v).toISOString());

function toStaffOrg(r: OrgRowRaw): StaffOrganization {
  return {
    id: r.id,
    name: r.name,
    suspendedAt: toIso(r.suspended_at),
    suspendedReason: r.suspended_reason,
    memberCount: Number(r.member_count),
    teamCount: Number(r.team_count),
    planCount: Number(r.plan_count),
    taskCount: Number(r.task_count),
    messageCount: Number(r.message_count),
    pageCount: Number(r.page_count),
    lastActiveAt: toIso(r.last_active_at)!,
    createdAt: toIso(r.created_at)!,
  };
}

async function rows<T>(deps: Deps, query: SQL): Promise<T[]> {
  const result = (await deps.db.execute(query)) as unknown as { rows?: T[] } | T[];
  return Array.isArray(result) ? result : (result.rows ?? []);
}

export async function listOrganizations(
  deps: Deps,
  q: { q?: string; status?: "active" | "suspended"; limit: number; offset: number },
) {
  const where: SQL[] = [];
  if (q.q) where.push(sql`o.name ilike ${`%${q.q}%`}`);
  if (q.status === "active") where.push(sql`o.suspended_at is null`);
  if (q.status === "suspended") where.push(sql`o.suspended_at is not null`);
  const whereSql = where.length ? sql` where ${sql.join(where, sql` and `)}` : sql``;
  const items = await rows<OrgRowRaw>(
    deps,
    sql`${orgSelect()}${whereSql} order by o.created_at desc limit ${q.limit} offset ${q.offset}`,
  );
  const [total] = await rows<{ n: number }>(deps, sql`select count(*)::int as n from organizations o${whereSql}`);
  return { items: items.map(toStaffOrg), total: Number(total?.n ?? 0), limit: q.limit, offset: q.offset };
}

export async function getOrganization(deps: Deps, orgId: string) {
  const [row] = await rows<OrgRowRaw>(deps, sql`${orgSelect()} where o.id = ${orgId}`);
  if (!row) throw notFound("Organization not found");
  const members = await deps.db
    .select({ m: organizationMemberships, u: users })
    .from(organizationMemberships)
    .innerJoin(users, eq(users.id, organizationMemberships.userId))
    .where(eq(organizationMemberships.organizationId, orgId))
    .orderBy(users.firstName, users.lastName);
  const teamRows = await deps.db.select().from(teams).where(eq(teams.organizationId, orgId)).orderBy(teams.name);
  const tms = await deps.db
    .select({ teamId: teamMemberships.teamId, isLead: teamMemberships.isLead, u: users })
    .from(teamMemberships)
    .innerJoin(users, eq(users.id, teamMemberships.userId))
    .where(eq(teamMemberships.organizationId, orgId));
  return {
    organization: toStaffOrg(row),
    members: members.map(({ m, u }) => ({
      ...personRef(u),
      role: m.role as OrgRole,
      isActive: u.isActive,
      joinedAt: m.createdAt.toISOString(),
    })),
    teams: teamRows.map((t) => {
      const people = tms.filter((x) => x.teamId === t.id);
      const lead = people.find((p) => p.isLead);
      return { id: t.id, name: t.name, memberCount: people.length, lead: lead ? personRef(lead.u) : null };
    }),
  };
}

export async function audit(
  deps: Deps,
  actorId: string,
  action: string,
  targetType: string,
  targetId: string,
  reason?: string | null,
  metadata?: Record<string, unknown>,
) {
  await deps.db.insert(adminAuditLog).values({ actorId, action, targetType, targetId, reason: reason ?? null, metadata: metadata ?? null });
}

export async function suspendOrganization(deps: Deps, actor: UserRow, orgId: string, reason: string) {
  const [org] = await deps.db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw notFound("Organization not found");
  if (org.suspendedAt) throw conflict("This organization is already suspended.");
  await deps.db.update(organizations).set({ suspendedAt: deps.now(), suspendedReason: reason }).where(eq(organizations.id, orgId));
  await deps.identity.setOrganizationSuspended(orgId, true).catch(() => undefined);
  await audit(deps, actor.id, "organization.suspend", "organization", orgId, reason);
  await deps.notifier.trigger("org-suspended", await orgMemberIds(deps, orgId), { organizationName: org.name, reason });
}

export async function reinstateOrganization(deps: Deps, actor: UserRow, orgId: string) {
  const [org] = await deps.db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw notFound("Organization not found");
  if (!org.suspendedAt) throw conflict("This organization isn't suspended.");
  await deps.db.update(organizations).set({ suspendedAt: null, suspendedReason: null }).where(eq(organizations.id, orgId));
  await deps.identity.setOrganizationSuspended(orgId, false).catch(() => undefined);
  await audit(deps, actor.id, "organization.reinstate", "organization", orgId);
  await deps.notifier.trigger("org-reinstated", await orgMemberIds(deps, orgId), {
    organizationName: org.name,
    url: `${deps.config.WEB_ORIGIN}/app/${orgId}/week`,
  });
}

// -- Users ---------------------------------------------------------------------------

const isOwnerSql = sql<boolean>`exists (select 1 from organization_memberships om where om.user_id = ${users.id} and om.role = 'owner')`;

function toStaffUser(u: UserRow, isOwner: boolean): StaffUser {
  return {
    ...personRef(u),
    platformRole: u.platformRole as StaffUser["platformRole"],
    isActive: u.isActive,
    createdAt: u.createdAt.toISOString(),
    isOwner,
  };
}

export async function listUsers(deps: Deps, q: { q?: string; limit: number; offset: number }) {
  const where = q.q
    ? or(
        ilike(users.email, `%${q.q}%`),
        ilike(users.firstName, `%${q.q}%`),
        ilike(users.lastName, `%${q.q}%`),
        ilike(sql`${users.firstName} || ' ' || ${users.lastName}`, `%${q.q}%`),
      )
    : undefined;
  const [total] = await deps.db.select({ n: count() }).from(users).where(where);
  const list = await deps.db
    .select({ u: users, isOwner: isOwnerSql })
    .from(users)
    .where(where)
    .orderBy(desc(users.createdAt))
    .limit(q.limit)
    .offset(q.offset);
  return { items: list.map(({ u, isOwner }) => toStaffUser(u, !!isOwner)), total: total?.n ?? 0, limit: q.limit, offset: q.offset };
}

export async function getUser(deps: Deps, userId: string): Promise<StaffUserDetail> {
  const [row] = await deps.db.select({ u: users, isOwner: isOwnerSql }).from(users).where(eq(users.id, userId));
  if (!row) throw notFound("User not found");
  const memberships = await deps.db
    .select({ m: organizationMemberships, o: organizations })
    .from(organizationMemberships)
    .innerJoin(organizations, eq(organizations.id, organizationMemberships.organizationId))
    .where(eq(organizationMemberships.userId, userId))
    .orderBy(organizations.name);
  return {
    ...toStaffUser(row.u, !!row.isOwner),
    memberships: memberships.map(({ m, o }) => ({
      organizationId: o.id,
      organizationName: o.name,
      role: m.role as OrgRole,
      organizationSuspended: o.suspendedAt !== null,
      joinedAt: m.createdAt.toISOString(),
    })),
  };
}

/** Staff create customer accounts only; staff accounts come from the CLI or a super admin. */
export async function createCustomer(
  deps: Deps,
  actor: UserRow,
  input: { firstName: string; lastName: string; email: string; password: string },
) {
  const existing = await deps.identity.findUserByEmail(input.email);
  if (existing) throw conflict(`There's already an account for ${input.email}.`, "EMAIL_TAKEN", "email");
  const created = await deps.identity.createUser({ ...input, platformRole: "none" });
  const row = await upsertUserMirror(deps, created);
  await audit(deps, actor.id, "user.create", "user", row.id);
  return toStaffUser(row, false);
}

async function isOwnerAnywhere(deps: Deps, userId: string) {
  const [row] = await deps.db
    .select({ n: count() })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.userId, userId), eq(organizationMemberships.role, "owner")));
  return (row?.n ?? 0) > 0;
}

/**
 * Edit names, or deactivate/reactivate (Clerk ban ends every session).
 * Regular staff can't deactivate organization owners or other staff; that's
 * the super admin's job. Nobody deactivates themselves.
 */
export async function updateUser(
  deps: Deps,
  actor: UserRow,
  userId: string,
  input: { firstName?: string; lastName?: string; isActive?: boolean },
) {
  const [target] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!target) throw notFound("User not found");
  if (input.isActive !== undefined && input.isActive !== target.isActive) {
    if (target.id === actor.id) throw conflict("You can't deactivate your own account.", "SELF_DEACTIVATE");
    if (actor.platformRole !== "superadmin") {
      if (target.platformRole !== "none") {
        throw forbidden("Only a super admin can deactivate staff accounts.", "SUPERADMIN_REQUIRED");
      }
      if (await isOwnerAnywhere(deps, target.id)) {
        throw forbidden("Only a super admin can suspend an organization owner.", "SUPERADMIN_REQUIRED");
      }
    }
    await deps.identity.setBanned(target.id, !input.isActive);
    await audit(deps, actor.id, input.isActive ? "user.reactivate" : "user.deactivate", "user", target.id);
  }
  if (input.firstName !== undefined || input.lastName !== undefined) {
    await deps.identity.updateUser(target.id, { firstName: input.firstName, lastName: input.lastName });
  }
  const [updated] = await deps.db
    .update(users)
    .set({
      firstName: input.firstName ?? target.firstName,
      lastName: input.lastName ?? target.lastName,
      isActive: input.isActive ?? target.isActive,
      updatedAt: deps.now(),
    })
    .where(eq(users.id, target.id))
    .returning();
  return toStaffUser(updated!, await isOwnerAnywhere(deps, target.id));
}

export async function setPassword(deps: Deps, actor: UserRow, userId: string, password: string) {
  const [target] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (!target) throw notFound("User not found");
  if (target.platformRole !== "none" && actor.platformRole !== "superadmin" && target.id !== actor.id) {
    throw forbidden("Only a super admin can set a staff member's password.", "SUPERADMIN_REQUIRED");
  }
  await deps.identity.updateUser(userId, { password });
  await audit(deps, actor.id, "user.set_password", "user", userId);
}

// -- AI usage ------------------------------------------------------------------------

export async function aiUsageSummary(deps: Deps, days: number): Promise<AiUsageByOrg[]> {
  const since = new Date(deps.now().getTime() - days * 86_400_000);
  const result = await deps.db
    .select({
      organizationId: organizations.id,
      organizationName: organizations.name,
      calls: count(),
      succeeded: sql<number>`count(*) filter (where ${aiUsageEvents.outcome} = 'succeeded')::int`,
      failed: sql<number>`count(*) filter (where ${aiUsageEvents.outcome} = 'failed')::int`,
      rateLimited: sql<number>`count(*) filter (where ${aiUsageEvents.outcome} = 'rate_limited')::int`,
      inputTokens: sql<number>`coalesce(sum(${aiUsageEvents.inputTokens}), 0)::int`,
      outputTokens: sql<number>`coalesce(sum(${aiUsageEvents.outputTokens}), 0)::int`,
      lastCallAt: sql<Date | null>`max(${aiUsageEvents.createdAt})`,
    })
    .from(aiUsageEvents)
    .innerJoin(organizations, eq(organizations.id, aiUsageEvents.organizationId))
    .where(gte(aiUsageEvents.createdAt, since))
    .groupBy(organizations.id, organizations.name)
    .orderBy(desc(count()));
  return result.map((r) => ({
    ...r,
    succeeded: Number(r.succeeded),
    failed: Number(r.failed),
    rateLimited: Number(r.rateLimited),
    inputTokens: Number(r.inputTokens),
    outputTokens: Number(r.outputTokens),
    lastCallAt: r.lastCallAt ? new Date(r.lastCallAt).toISOString() : null,
  }));
}

export async function aiUsageEventsList(
  deps: Deps,
  q: { organizationId?: string; outcome?: string; limit: number; offset: number },
) {
  const where = and(
    q.organizationId ? eq(aiUsageEvents.organizationId, q.organizationId) : undefined,
    q.outcome ? eq(aiUsageEvents.outcome, q.outcome) : undefined,
  );
  const [total] = await deps.db.select({ n: count() }).from(aiUsageEvents).where(where);
  const list = await deps.db
    .select({ e: aiUsageEvents, orgName: organizations.name })
    .from(aiUsageEvents)
    .innerJoin(organizations, eq(organizations.id, aiUsageEvents.organizationId))
    .where(where)
    .orderBy(desc(aiUsageEvents.createdAt))
    .limit(q.limit)
    .offset(q.offset);
  const items: AiUsageEvent[] = list.map(({ e, orgName }) => ({
    id: e.id,
    organizationId: e.organizationId,
    organizationName: orgName,
    operation: e.operation as AiUsageEvent["operation"],
    outcome: e.outcome as AiUsageEvent["outcome"],
    errorKind: e.errorKind,
    model: e.model,
    latencyMs: e.latencyMs,
    createdAt: e.createdAt.toISOString(),
  }));
  return { items, total: total?.n ?? 0, limit: q.limit, offset: q.offset };
}

export async function overview(deps: Deps) {
  const [orgs] = await deps.db.select({ n: count() }).from(organizations);
  const [suspended] = await deps.db.select({ n: count() }).from(organizations).where(isNotNull(organizations.suspendedAt));
  const [userCount] = await deps.db.select({ n: count() }).from(users).where(eq(users.platformRole, "none"));
  const [inactive] = await deps.db.select({ n: count() }).from(users).where(eq(users.isActive, false));
  const ai = await aiUsageSummary(deps, 7);
  const totals = ai.reduce(
    (acc, r) => ({
      calls: acc.calls + r.calls,
      failed: acc.failed + r.failed + r.rateLimited,
      tokens: acc.tokens + r.inputTokens + r.outputTokens,
    }),
    { calls: 0, failed: 0, tokens: 0 },
  );
  return {
    organizations: orgs?.n ?? 0,
    suspendedOrganizations: suspended?.n ?? 0,
    customers: userCount?.n ?? 0,
    deactivatedUsers: inactive?.n ?? 0,
    ai7d: { ...totals, topOrganizations: ai.slice(0, 5) },
  };
}

export { isNull, iso };
