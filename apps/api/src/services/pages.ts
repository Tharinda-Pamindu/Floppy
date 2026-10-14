import type { PageDetail, PageSummary, PageVersionSummary } from "@floppy/shared";
import { LIMITS } from "@floppy/shared";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import type { OrgContext } from "../auth/middleware.js";
import type { Deps } from "../context.js";
import { orgPages, orgPageVersions, teams } from "../db/schema.js";
import { AppError, conflict, forbidden, invalid, notFound } from "../errors.js";
import { orgMemberIds } from "./orgs.js";
import { displayName, loadPeople } from "./people.js";
import type { UserRow } from "./sync.js";
import { canManageTeamContent, isUuid, loadTeam, teamMemberIds } from "./teams.js";

type PageRow = typeof orgPages.$inferSelect;

export function slugify(title: string): string {
  const base = title
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
  return base || "page";
}

/** Owners and admins edit any page; a team lead edits their team's pages. Everyone reads. */
function canEdit(org: OrgContext, page: Pick<PageRow, "teamId">) {
  return canManageTeamContent(org, page.teamId);
}

function requireEditor(org: OrgContext, page: Pick<PageRow, "teamId">) {
  if (!canEdit(org, page)) {
    throw forbidden(
      page.teamId
        ? "Only this team's lead or an organization admin can edit this page."
        : "Only organization owners and admins can edit organization-wide pages.",
      "PAGE_EDITOR_REQUIRED",
    );
  }
}

async function loadPage(deps: Deps, org: OrgContext, pageId: string): Promise<PageRow> {
  if (!isUuid(pageId)) throw notFound("Page not found");
  const [page] = await deps.db
    .select()
    .from(orgPages)
    .where(and(eq(orgPages.organizationId, org.organizationId), eq(orgPages.id, pageId), isNull(orgPages.archivedAt)));
  if (!page) throw notFound("Page not found");
  return page;
}

async function uniqueSlug(deps: Deps, orgId: string, title: string) {
  const base = slugify(title);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [taken] = await deps.db
      .select({ id: orgPages.id })
      .from(orgPages)
      .where(and(eq(orgPages.organizationId, orgId), eq(orgPages.slug, slug)));
    if (!taken) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

async function validatePlacement(deps: Deps, org: OrgContext, pageId: string | null, teamId: string | null, parentId: string | null) {
  if (teamId) await loadTeam(deps.db, org.organizationId, teamId);
  if (parentId) {
    if (parentId === pageId) throw invalid("A page can't be its own parent.", "parentId");
    const parent = await loadPage(deps, org, parentId);
    if (parent.parentId) throw invalid("Pages nest one level deep. Pick a top-level page as the parent.", "parentId");
    if (pageId) {
      const [child] = await deps.db.select({ id: orgPages.id }).from(orgPages).where(eq(orgPages.parentId, pageId));
      if (child) throw invalid("This page has sub-pages, so it can't become a sub-page itself.", "parentId");
    }
  }
}

async function toSummaries(deps: Deps, org: OrgContext, rows: PageRow[]): Promise<PageSummary[]> {
  if (!rows.length) return [];
  const versions = await deps.db
    .select({ pageId: orgPageVersions.pageId, authorId: orgPageVersions.authorId, version: orgPageVersions.version })
    .from(orgPageVersions)
    .where(sql`(${orgPageVersions.pageId}, ${orgPageVersions.version}) IN (SELECT id, current_version FROM org_pages WHERE organization_id = ${org.organizationId})`);
  const latestAuthor = new Map(versions.map((v) => [v.pageId, v.authorId]));
  const people = await loadPeople(deps.db, [...latestAuthor.values()]);
  const teamRows = await deps.db.select({ id: teams.id, name: teams.name }).from(teams).where(eq(teams.organizationId, org.organizationId));
  const teamName = new Map(teamRows.map((t) => [t.id, t.name]));
  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    slug: p.slug,
    teamId: p.teamId,
    teamName: p.teamId ? (teamName.get(p.teamId) ?? null) : null,
    parentId: p.parentId,
    currentVersion: p.currentVersion,
    updatedAt: (p.updatedAt ?? p.createdAt).toISOString(),
    updatedBy: people.get(latestAuthor.get(p.id) ?? "") ?? null,
    canEdit: canEdit(org, p),
  }));
}

export async function listPages(deps: Deps, org: OrgContext) {
  const rows = await deps.db
    .select()
    .from(orgPages)
    .where(and(eq(orgPages.organizationId, org.organizationId), isNull(orgPages.archivedAt)))
    .orderBy(asc(orgPages.title));
  return toSummaries(deps, org, rows);
}

export async function getPage(deps: Deps, org: OrgContext, pageId: string, version?: number): Promise<PageDetail> {
  const page = await loadPage(deps, org, pageId);
  const wanted = version ?? page.currentVersion;
  const [v] = await deps.db
    .select()
    .from(orgPageVersions)
    .where(and(eq(orgPageVersions.pageId, page.id), eq(orgPageVersions.version, wanted)));
  if (!v) throw notFound("That version doesn't exist.");
  const [summary] = await toSummaries(deps, org, [page]);
  const children = await deps.db
    .select()
    .from(orgPages)
    .where(and(eq(orgPages.parentId, page.id), isNull(orgPages.archivedAt)))
    .orderBy(asc(orgPages.title));
  return {
    ...summary!,
    // Old versions show their own title; the page's current title stays in the tree.
    title: v.title,
    bodyMd: v.bodyMd,
    version: v.version,
    changeNote: v.changeNote,
    children: await toSummaries(deps, org, children),
  };
}

export async function listVersions(deps: Deps, org: OrgContext, pageId: string): Promise<PageVersionSummary[]> {
  const page = await loadPage(deps, org, pageId);
  const rows = await deps.db
    .select({
      version: orgPageVersions.version,
      title: orgPageVersions.title,
      changeNote: orgPageVersions.changeNote,
      authorId: orgPageVersions.authorId,
      createdAt: orgPageVersions.createdAt,
      bytes: sql<number>`octet_length(${orgPageVersions.bodyMd})::int`,
    })
    .from(orgPageVersions)
    .where(eq(orgPageVersions.pageId, page.id))
    .orderBy(desc(orgPageVersions.version));
  const people = await loadPeople(deps.db, rows.map((r) => r.authorId));
  return rows.map((r) => ({
    version: r.version,
    title: r.title,
    changeNote: r.changeNote,
    author: r.authorId ? (people.get(r.authorId) ?? null) : null,
    createdAt: r.createdAt.toISOString(),
    bytes: Number(r.bytes),
  }));
}

export async function createPage(
  deps: Deps,
  org: OrgContext,
  user: UserRow,
  input: { title: string; bodyMd: string; teamId?: string | null; parentId?: string | null; changeNote?: string | null },
) {
  const teamId = input.teamId ?? null;
  let parentId = input.parentId ?? null;
  await validatePlacement(deps, org, null, teamId, parentId);
  requireEditor(org, { teamId });
  if (parentId === null) parentId = null;
  const slug = await uniqueSlug(deps, org.organizationId, input.title);
  const page = await deps.db.transaction(async (tx) => {
    const [created] = await tx
      .insert(orgPages)
      .values({ organizationId: org.organizationId, teamId, parentId, title: input.title, slug, currentVersion: 1, createdById: user.id })
      .returning();
    await tx.insert(orgPageVersions).values({
      pageId: created!.id,
      version: 1,
      title: input.title,
      bodyMd: input.bodyMd,
      changeNote: input.changeNote ?? "Created",
      authorId: user.id,
    });
    return created!;
  });
  await notifyPageUpdated(deps, org, user, page, 1);
  return page;
}

/**
 * Append a new version. `baseVersion` is the version the editor started from;
 * if someone saved in between, the save is refused with 409 so nobody
 * overwrites another person's edit without seeing it.
 */
export async function saveVersion(
  deps: Deps,
  org: OrgContext,
  user: UserRow,
  pageId: string,
  input: { title: string; bodyMd: string; baseVersion: number; changeNote?: string | null },
) {
  const page = await loadPage(deps, org, pageId);
  requireEditor(org, page);
  const next = input.baseVersion + 1;
  const saved = await deps.db.transaction(async (tx) => {
    const [bumped] = await tx
      .update(orgPages)
      .set({ currentVersion: next, title: input.title, updatedAt: deps.now() })
      .where(and(eq(orgPages.id, page.id), eq(orgPages.currentVersion, input.baseVersion)))
      .returning();
    if (!bumped) return null;
    await tx.insert(orgPageVersions).values({
      pageId: page.id,
      version: next,
      title: input.title,
      bodyMd: input.bodyMd,
      changeNote: input.changeNote ?? null,
      authorId: user.id,
    });
    return bumped;
  });
  if (!saved) {
    const [latest] = await deps.db.select({ v: orgPages.currentVersion }).from(orgPages).where(eq(orgPages.id, page.id));
    throw new AppError(
      409,
      "PAGE_VERSION_CONFLICT",
      `Someone saved version ${latest?.v ?? "?"} while you were editing version ${input.baseVersion}. Reload their version, or save yours as a new version on top.`,
    );
  }
  await notifyPageUpdated(deps, org, user, saved, next);
  return saved;
}

/** An uploaded .md file becomes a new version (same rules as a save). */
export async function importMarkdown(
  deps: Deps,
  org: OrgContext,
  user: UserRow,
  pageId: string,
  input: { raw: Buffer; baseVersion: number; fileName?: string },
) {
  if (input.raw.length > LIMITS.pageBodyMaxBytes) throw invalid("A page can be at most 200 KB.", "file");
  const text = new TextDecoder("utf-8", { fatal: false }).decode(input.raw);
  if (text.includes("\u0000") || text.includes("�")) {
    throw invalid("That file isn't a UTF-8 text/markdown file.", "file");
  }
  const page = await loadPage(deps, org, pageId);
  const body = text.replace(/^﻿/, "");
  return saveVersion(deps, org, user, pageId, {
    title: page.title,
    bodyMd: body,
    baseVersion: input.baseVersion,
    changeNote: `Imported ${input.fileName?.slice(0, 120) || "markdown file"}`,
  });
}

export async function exportMarkdown(deps: Deps, org: OrgContext, pageId: string, version?: number) {
  const detail = await getPage(deps, org, pageId, version);
  return { fileName: `${detail.slug}-v${detail.version}.md`, body: detail.bodyMd };
}

export async function movePage(deps: Deps, org: OrgContext, pageId: string, input: { teamId?: string | null; parentId?: string | null }) {
  const page = await loadPage(deps, org, pageId);
  requireEditor(org, page);
  const teamId = input.teamId === undefined ? page.teamId : input.teamId;
  const parentId = input.parentId === undefined ? page.parentId : input.parentId;
  await validatePlacement(deps, org, page.id, teamId, parentId);
  requireEditor(org, { teamId });
  await deps.db.update(orgPages).set({ teamId, parentId, updatedAt: deps.now() }).where(eq(orgPages.id, page.id));
}

export async function archivePage(deps: Deps, org: OrgContext, pageId: string) {
  const page = await loadPage(deps, org, pageId);
  requireEditor(org, page);
  const [child] = await deps.db
    .select({ id: orgPages.id })
    .from(orgPages)
    .where(and(eq(orgPages.parentId, page.id), isNull(orgPages.archivedAt)));
  if (child) throw conflict("Archive or move this page's sub-pages first.", "PAGE_HAS_CHILDREN");
  await deps.db.update(orgPages).set({ archivedAt: deps.now() }).where(eq(orgPages.id, page.id));
}

async function notifyPageUpdated(deps: Deps, org: OrgContext, editor: UserRow, page: PageRow, version: number) {
  const audience = page.teamId ? await teamMemberIds(deps.db, page.teamId) : await orgMemberIds(deps, org.organizationId);
  const to = audience.filter((id) => id !== editor.id);
  if (!to.length) return;
  await deps.notifier.trigger("page-updated", to, {
    organizationId: org.organizationId,
    pageId: page.id,
    pageTitle: page.title,
    version,
    editorName: displayName(editor),
    url: `${deps.config.WEB_ORIGIN}/app/${org.organizationId}/pages/${page.id}`,
  });
}
