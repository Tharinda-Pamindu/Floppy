/**
 * Keeps the Supabase mirror of Clerk users, organizations and memberships in
 * step. Clerk webhooks call these; so does the request path ("lazy sync"), so
 * local development works without a public webhook URL.
 */
import { DEFAULT_FIRST_TEAM_NAME } from "@floppy/shared";
import { and, eq, inArray, notInArray } from "drizzle-orm";
import type { Deps } from "../context.js";
import type { Db } from "../db/client.js";
import { organizationMemberships, organizations, teams, userSettings, users } from "../db/schema.js";
import { logger } from "../logger.js";
import type { IdentityMembership, IdentityUser } from "../ports.js";

export type UserRow = typeof users.$inferSelect;

export async function upsertUserMirror(deps: Pick<Deps, "db" | "notifier">, u: IdentityUser): Promise<UserRow> {
  const values = {
    id: u.id,
    email: u.email.toLowerCase(),
    firstName: u.firstName,
    lastName: u.lastName,
    imageUrl: u.imageUrl,
    platformRole: u.platformRole,
    isActive: !u.banned,
  };
  const [existing] = await deps.db.select().from(users).where(eq(users.id, u.id));
  let row: UserRow;
  if (existing) {
    [row] = (await deps.db
      .update(users)
      .set({ ...values, updatedAt: new Date() })
      .where(eq(users.id, u.id))
      .returning()) as [UserRow];
  } else {
    [row] = (await deps.db.insert(users).values(values).onConflictDoUpdate({ target: users.id, set: values }).returning()) as [
      UserRow,
    ];
    await deps.db.insert(userSettings).values({ userId: u.id, phone: u.phone }).onConflictDoNothing();
  }
  const [settings] = await deps.db.select().from(userSettings).where(eq(userSettings.userId, u.id));
  await deps.notifier.upsertSubscriber({
    id: u.id,
    email: values.email,
    firstName: u.firstName,
    lastName: u.lastName,
    phone: settings?.phone ?? u.phone,
    timezone: settings?.timezone ?? null,
  });
  if (!existing) {
    await deps.notifier.trigger("welcome", u.id, { firstName: u.firstName || "there" }, { transactionId: `welcome-${u.id}` });
  }
  return row;
}

/** The local user row, created from Clerk on first sight. */
export async function ensureUser(deps: Pick<Deps, "db" | "identity" | "notifier">, userId: string): Promise<UserRow | null> {
  const [row] = await deps.db.select().from(users).where(eq(users.id, userId));
  if (row) return row;
  const remote = await deps.identity.getUser(userId);
  if (!remote) return null;
  return upsertUserMirror(deps, remote);
}

/** Create the org mirror (and its required first team) if it doesn't exist yet. */
export async function ensureOrganizationMirror(db: Db, orgId: string, name: string) {
  const [existing] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  if (existing) return existing;
  const [org] = await db.insert(organizations).values({ id: orgId, name }).onConflictDoNothing().returning();
  if (org) {
    await db.insert(teams).values({ organizationId: orgId, name: DEFAULT_FIRST_TEAM_NAME }).onConflictDoNothing();
    return org;
  }
  const [raced] = await db.select().from(organizations).where(eq(organizations.id, orgId));
  return raced!;
}

export async function applyMembership(db: Db, m: IdentityMembership) {
  await ensureOrganizationMirror(db, m.organizationId, m.organizationName);
  await db
    .insert(organizationMemberships)
    .values({ organizationId: m.organizationId, userId: m.userId, role: m.role, createdAt: m.createdAt })
    .onConflictDoUpdate({
      target: [organizationMemberships.organizationId, organizationMemberships.userId],
      set: { role: m.role, updatedAt: new Date() },
    });
}

export async function removeMembershipMirror(db: Db, orgId: string, userId: string) {
  await db
    .delete(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, orgId), eq(organizationMemberships.userId, userId)));
}

/**
 * Bring one person's memberships in line with Clerk. Called when the org list
 * loads, which is where someone lands after accepting a Clerk invitation.
 */
export async function reconcileUserMemberships(deps: Pick<Deps, "db" | "identity" | "notifier">, userId: string) {
  let remote: IdentityMembership[];
  try {
    remote = await deps.identity.listUserMemberships(userId);
  } catch (err) {
    logger.warn({ err, userId }, "Could not reach Clerk to reconcile memberships; using the local mirror");
    return;
  }
  const local = await deps.db
    .select({ organizationId: organizationMemberships.organizationId })
    .from(organizationMemberships)
    .where(eq(organizationMemberships.userId, userId));
  const localIds = new Set(local.map((m) => m.organizationId));
  for (const m of remote) {
    if (!localIds.has(m.organizationId)) {
      await applyMembership(deps.db, m);
      await notifyMemberJoined(deps, m);
    }
  }
  const remoteIds = remote.map((m) => m.organizationId);
  await deps.db
    .delete(organizationMemberships)
    .where(
      remoteIds.length
        ? and(eq(organizationMemberships.userId, userId), notInArray(organizationMemberships.organizationId, remoteIds))
        : eq(organizationMemberships.userId, userId),
    );
}

export async function notifyMemberJoined(deps: Pick<Deps, "db" | "notifier">, m: IdentityMembership) {
  const managers = await deps.db
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, m.organizationId),
        inArray(organizationMemberships.role, ["owner", "admin"]),
      ),
    );
  const [person] = await deps.db.select().from(users).where(eq(users.id, m.userId));
  const to = managers.map((x) => x.userId).filter((id) => id !== m.userId);
  if (!to.length) return;
  await deps.notifier.trigger(
    "member-joined",
    to,
    {
      organizationId: m.organizationId,
      organizationName: m.organizationName,
      memberName: person ? `${person.firstName} ${person.lastName}`.trim() || person.email : "Someone",
      role: m.role,
    },
    { transactionId: `member-joined-${m.organizationId}-${m.userId}` },
  );
}
