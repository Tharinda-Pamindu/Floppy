import type { GithubIssue, TeamRepo } from "@floppy/shared";
import { and, eq, inArray } from "drizzle-orm";
import type { OrgContext } from "../auth/middleware.js";
import type { Deps } from "../context.js";
import { assignedTasks, teamRepos } from "../db/schema.js";
import { AppError, conflict, forbidden, invalid, notFound } from "../errors.js";
import type { GithubIssueInfo } from "../ports.js";
import { isUniqueViolation } from "./orgs.js";
import { iso, loadPeople } from "./people.js";
import { canManageTeamContent, isUuid, loadTeam } from "./teams.js";

type RepoRow = typeof teamRepos.$inferSelect;

async function toRepos(deps: Deps, rows: RepoRow[]): Promise<TeamRepo[]> {
  const people = await loadPeople(deps.db, rows.map((r) => r.addedById));
  return rows.map((r) => ({
    id: r.id,
    teamId: r.teamId,
    owner: r.owner,
    name: r.name,
    fullName: `${r.owner}/${r.name}`,
    htmlUrl: r.htmlUrl,
    addedBy: r.addedById ? (people.get(r.addedById) ?? null) : null,
    createdAt: iso(r.createdAt)!,
  }));
}

export async function listRepos(deps: Deps, org: OrgContext, teamId: string) {
  await loadTeam(deps.db, org.organizationId, teamId);
  const rows = await deps.db
    .select()
    .from(teamRepos)
    .where(and(eq(teamRepos.organizationId, org.organizationId), eq(teamRepos.teamId, teamId)))
    .orderBy(teamRepos.owner, teamRepos.name);
  return toRepos(deps, rows);
}

/** Team leads (of this team), owners and admins link repositories. The repo must exist on GitHub. */
export async function linkRepo(deps: Deps, org: OrgContext, userId: string, teamId: string, fullName: string) {
  await loadTeam(deps.db, org.organizationId, teamId);
  if (!canManageTeamContent(org, teamId)) {
    throw forbidden("Only this team's lead or an organization admin can link repositories.", "TEAM_LEAD_REQUIRED");
  }
  const [owner, name] = fullName.split("/") as [string, string];
  let info;
  try {
    info = await deps.github.getRepo(owner, name);
  } catch {
    throw new AppError(502, "GITHUB_UNAVAILABLE", "We couldn't reach GitHub. Try again in a moment.");
  }
  if (!info) {
    throw invalid(
      `GitHub repository ${fullName} wasn't found. For private repositories, the server needs a GITHUB_TOKEN with access.`,
      "repo",
    );
  }
  try {
    const [row] = await deps.db
      .insert(teamRepos)
      .values({ organizationId: org.organizationId, teamId, owner: info.owner, name: info.name, htmlUrl: info.htmlUrl, addedById: userId })
      .returning();
    return (await toRepos(deps, [row!]))[0]!;
  } catch (err) {
    if (isUniqueViolation(err)) throw conflict(`${fullName} is already linked to this team.`, "REPO_LINKED", "repo");
    throw err;
  }
}

export async function unlinkRepo(deps: Deps, org: OrgContext, teamId: string, repoId: string) {
  await loadTeam(deps.db, org.organizationId, teamId);
  if (!canManageTeamContent(org, teamId)) {
    throw forbidden("Only this team's lead or an organization admin can unlink repositories.", "TEAM_LEAD_REQUIRED");
  }
  if (!isUuid(repoId)) throw notFound("Repository not found");
  const removed = await deps.db
    .delete(teamRepos)
    .where(and(eq(teamRepos.organizationId, org.organizationId), eq(teamRepos.teamId, teamId), eq(teamRepos.id, repoId)))
    .returning();
  if (!removed.length) throw notFound("Repository not found");
}

// Open issues are cached briefly so the team page doesn't spend the GitHub rate limit.
const issueCache = new Map<string, { at: number; value: { issues: GithubIssueInfo[]; hasMore: boolean } }>();
const CACHE_MS = 5 * 60_000;

export async function listIssues(deps: Deps, org: OrgContext, teamId: string, repoId: string, page: number) {
  await loadTeam(deps.db, org.organizationId, teamId);
  if (!isUuid(repoId)) throw notFound("Repository not found");
  const [repo] = await deps.db
    .select()
    .from(teamRepos)
    .where(and(eq(teamRepos.organizationId, org.organizationId), eq(teamRepos.teamId, teamId), eq(teamRepos.id, repoId)));
  if (!repo) throw notFound("Repository not found");

  const key = `${repo.owner}/${repo.name}#${page}`;
  const cached = issueCache.get(key);
  let result = cached && Date.now() - cached.at < CACHE_MS ? cached.value : null;
  if (!result) {
    try {
      result = await deps.github.listOpenIssues(repo.owner, repo.name, page);
    } catch {
      throw new AppError(502, "GITHUB_UNAVAILABLE", "We couldn't load issues from GitHub. Try again in a moment.");
    }
    issueCache.set(key, { at: Date.now(), value: result });
  }
  const numbers = result.issues.map((i) => i.number);
  const linked = numbers.length
    ? await deps.db
        .select({ id: assignedTasks.id, number: assignedTasks.githubIssueNumber })
        .from(assignedTasks)
        .where(and(eq(assignedTasks.githubRepoId, repo.id), inArray(assignedTasks.githubIssueNumber, numbers)))
    : [];
  const linkMap = new Map(linked.map((l) => [l.number!, l.id]));
  const issues: GithubIssue[] = result.issues.map((i) => ({ ...i, assignedTaskId: linkMap.get(i.number) ?? null }));
  return { issues, hasMore: result.hasMore, page };
}

export function clearIssueCache() {
  issueCache.clear();
}
