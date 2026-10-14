import type { Team, TeamMember } from "@floppy/shared";
import { and, count, eq, inArray, ne } from "drizzle-orm";
import type { OrgContext } from "../auth/middleware.js";
import { requireManager } from "../auth/middleware.js";
import type { Deps } from "../context.js";
import type { Db } from "../db/client.js";
import { assignedTasks, organizationMemberships, orgPages, teamMemberships, teamRepos, teams, users } from "../db/schema.js";
import { conflict, forbidden, notFound } from "../errors.js";
import { isUniqueViolation } from "./orgs.js";
import { displayName, personRef } from "./people.js";

export type TeamRow = typeof teams.$inferSelect;

export async function loadTeam(db: Db, orgId: string, teamId: string): Promise<TeamRow> {
  if (!isUuid(teamId)) throw notFound("Team not found");
  const [team] = await db.select().from(teams).where(and(eq(teams.organizationId, orgId), eq(teams.id, teamId)));
  if (!team) throw notFound("Team not found");
  return team;
}

export async function teamMembers(db: Db, teamIds: string[]): Promise<Map<string, TeamMember[]>> {
  const result = new Map<string, TeamMember[]>(teamIds.map((id) => [id, []]));
  if (!teamIds.length) return result;
  const rows = await db
    .select({ tm: teamMemberships, u: users })
    .from(teamMemberships)
    .innerJoin(users, eq(users.id, teamMemberships.userId))
    .where(inArray(teamMemberships.teamId, teamIds))
    .orderBy(users.firstName, users.lastName);
  for (const { tm, u } of rows) result.get(tm.teamId)?.push({ ...personRef(u), isLead: tm.isLead });
  // Lead first, then by name.
  for (const list of result.values()) list.sort((a, b) => Number(b.isLead) - Number(a.isLead));
  return result;
}

async function toTeams(db: Db, rows: TeamRow[]): Promise<Team[]> {
  const ids = rows.map((t) => t.id);
  const members = await teamMembers(db, ids);
  const repoCounts = ids.length
    ? await db
        .select({ teamId: teamRepos.teamId, n: count() })
        .from(teamRepos)
        .where(inArray(teamRepos.teamId, ids))
        .groupBy(teamRepos.teamId)
    : [];
  const repoMap = new Map(repoCounts.map((r) => [r.teamId, r.n]));
  return rows.map((t) => {
    const list = members.get(t.id) ?? [];
    return {
      id: t.id,
      name: t.name,
      description: t.description,
      members: list,
      lead: list.find((m) => m.isLead) ?? null,
      repoCount: repoMap.get(t.id) ?? 0,
    };
  });
}

export async function listTeams(deps: Deps, org: OrgContext): Promise<Team[]> {
  const rows = await deps.db.select().from(teams).where(eq(teams.organizationId, org.organizationId)).orderBy(teams.name);
  return toTeams(deps.db, rows);
}

export async function getTeam(deps: Deps, org: OrgContext, teamId: string): Promise<Team> {
  const team = await loadTeam(deps.db, org.organizationId, teamId);
  const [result] = await toTeams(deps.db, [team]);
  return result!;
}

export async function createTeam(deps: Deps, org: OrgContext, input: { name: string; description?: string | null }) {
  requireManager(org);
  try {
    const [team] = await deps.db
      .insert(teams)
      .values({ organizationId: org.organizationId, name: input.name, description: input.description ?? null })
      .returning();
    return getTeam(deps, org, team!.id);
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`A team called '${input.name}' already exists.`, "TEAM_NAME_TAKEN", "name");
    throw err;
  }
}

export async function updateTeam(
  deps: Deps,
  org: OrgContext,
  teamId: string,
  input: { name?: string; description?: string | null },
) {
  requireManager(org);
  await loadTeam(deps.db, org.organizationId, teamId);
  const changes: Partial<TeamRow> = { updatedAt: deps.now() };
  if (input.name !== undefined) changes.name = input.name;
  if (input.description !== undefined) changes.description = input.description;
  try {
    await deps.db.update(teams).set(changes).where(eq(teams.id, teamId));
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`A team called '${input.name}' already exists.`, "TEAM_NAME_TAKEN", "name");
    throw err;
  }
  return getTeam(deps, org, teamId);
}

/** Every organization keeps at least one team. Plans, tasks and pages survive. */
export async function deleteTeam(deps: Deps, org: OrgContext, teamId: string) {
  requireManager(org);
  await loadTeam(deps.db, org.organizationId, teamId);
  const [others] = await deps.db
    .select({ n: count() })
    .from(teams)
    .where(and(eq(teams.organizationId, org.organizationId), ne(teams.id, teamId)));
  if ((others?.n ?? 0) === 0) {
    throw conflict("An organization needs at least one team.", "LAST_TEAM");
  }
  await deps.db.transaction(async (tx) => {
    // FKs set these to null, but say it explicitly: team pages become org-wide.
    await tx.update(orgPages).set({ teamId: null }).where(eq(orgPages.teamId, teamId));
    await tx.update(assignedTasks).set({ teamId: null }).where(eq(assignedTasks.teamId, teamId));
    await tx.delete(teams).where(eq(teams.id, teamId));
  });
}

/** Add someone to the team or change whether they lead it; a new lead replaces the old one. */
export async function setTeamMember(deps: Deps, org: OrgContext, teamId: string, userId: string, isLead: boolean) {
  requireManager(org);
  const team = await loadTeam(deps.db, org.organizationId, teamId);
  const [member] = await deps.db
    .select({ id: organizationMemberships.id })
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, org.organizationId), eq(organizationMemberships.userId, userId)));
  if (!member) throw notFound("Member not found");

  const [before] = await deps.db
    .select()
    .from(teamMemberships)
    .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId)));

  await deps.db.transaction(async (tx) => {
    if (isLead) {
      // The partial unique index is checked per statement: clear the old lead first.
      await tx
        .update(teamMemberships)
        .set({ isLead: false })
        .where(and(eq(teamMemberships.teamId, teamId), ne(teamMemberships.userId, userId), eq(teamMemberships.isLead, true)));
    }
    await tx
      .insert(teamMemberships)
      .values({ organizationId: org.organizationId, teamId, userId, isLead })
      .onConflictDoUpdate({ target: [teamMemberships.teamId, teamMemberships.userId], set: { isLead } });
  });

  if (isLead && !before?.isLead) {
    const [person] = await deps.db.select().from(users).where(eq(users.id, userId));
    await deps.notifier.trigger("team-lead-assigned", userId, {
      organizationId: org.organizationId,
      teamId,
      teamName: team.name,
      firstName: person?.firstName ?? "",
      url: `${deps.config.WEB_ORIGIN}/app/${org.organizationId}/teams/${teamId}`,
    });
  }
  return getTeam(deps, org, teamId);
}

export async function removeTeamMember(deps: Deps, org: OrgContext, teamId: string, userId: string) {
  requireManager(org);
  await loadTeam(deps.db, org.organizationId, teamId);
  const removed = await deps.db
    .delete(teamMemberships)
    .where(and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.userId, userId)))
    .returning();
  if (!removed.length) throw notFound("Team member not found");
}

/** Team leads see their own team's week; owners and admins see every team. */
export function requireTeamViewer(org: OrgContext, teamId: string) {
  if (org.isManager || org.ledTeamIds.includes(teamId)) return;
  throw forbidden(
    "Only this team's lead or an organization admin can see the team's week.",
    "TEAM_LEAD_REQUIRED",
  );
}

/** Leads of the team, owners and admins can manage its repositories and pages. */
export function canManageTeamContent(org: OrgContext, teamId: string | null): boolean {
  if (org.isManager) return true;
  return teamId !== null && org.ledTeamIds.includes(teamId);
}

export async function teamMemberIds(db: Db, teamId: string): Promise<string[]> {
  const rows = await db.select({ userId: teamMemberships.userId }).from(teamMemberships).where(eq(teamMemberships.teamId, teamId));
  return rows.map((r) => r.userId);
}

export function teamLabel(team: Pick<TeamRow, "name">) {
  return team.name;
}

export { displayName };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}
