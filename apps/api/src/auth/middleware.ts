import type { OrgRole } from "@floppy/shared";
import { MANAGER_ROLES } from "@floppy/shared";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { and, eq } from "drizzle-orm";
import type { Deps } from "../context.js";
import { organizationMemberships, organizations, teamMemberships } from "../db/schema.js";
import { AppError, forbidden, notFound, unauthorized } from "../errors.js";
import { applyMembership, ensureUser, type UserRow } from "../services/sync.js";

export type OrganizationRow = typeof organizations.$inferSelect;

/** The caller, the organization in the URL, and their membership of it. */
export interface OrgContext {
  organization: OrganizationRow;
  organizationId: string;
  role: OrgRole;
  isManager: boolean;
  isOwner: boolean;
  /** Ids of teams the caller leads in this org. */
  ledTeamIds: string[];
}

declare module "express-serve-static-core" {
  interface Request {
    user?: UserRow;
    org?: OrgContext;
  }
}

export function currentUser(req: Request): UserRow {
  if (!req.user) throw unauthorized();
  return req.user;
}

export function currentOrg(req: Request): OrgContext {
  if (!req.org) throw new Error("orgContext middleware missing on this route");
  return req.org;
}

/**
 * Requires a signed-in, active user. The user is loaded from our mirror on
 * every request (created from Clerk on first sight), so a deactivated or
 * suspended account is refused even with a still-valid session token.
 */
export function requireUser(deps: Deps): RequestHandler {
  return async (req: Request, _res: Response, next: NextFunction) => {
    const userId = deps.auth.userIdOf(req);
    if (!userId) throw unauthorized();
    const user = await ensureUser(deps, userId);
    if (!user) throw unauthorized();
    if (!user.isActive) throw new AppError(403, "ACCOUNT_DISABLED", "This account has been deactivated.");
    req.user = user;
    next();
  };
}

/**
 * Every `/organizations/:orgId/...` route goes through this. Someone who isn't
 * a member gets 404, exactly as if the organization didn't exist, so ids can't
 * be probed. A suspended organization answers 403 ORGANIZATION_SUSPENDED.
 */
export async function resolveOrgContext(deps: Deps, orgId: string, user: UserRow): Promise<OrgContext> {
  if (!orgId || orgId.length > 64) throw notFound("Organization not found");

  const [org] = await deps.db.select().from(organizations).where(eq(organizations.id, orgId));
  if (!org) throw notFound("Organization not found");

  let [membership] = await deps.db
    .select()
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, orgId), eq(organizationMemberships.userId, user.id)));
  if (!membership) {
    // Lazy sync: someone who just accepted a Clerk invitation.
    const remote = await deps.identity.getMembership(orgId, user.id).catch(() => null);
    if (remote) {
      await applyMembership(deps.db, remote);
      [membership] = await deps.db
        .select()
        .from(organizationMemberships)
        .where(and(eq(organizationMemberships.organizationId, orgId), eq(organizationMemberships.userId, user.id)));
    }
  }
  if (!membership) throw notFound("Organization not found");
  if (org.suspendedAt) {
    throw forbidden("This organization is suspended. Contact support to restore access.", "ORGANIZATION_SUSPENDED");
  }

  const led = await deps.db
    .select({ teamId: teamMemberships.teamId })
    .from(teamMemberships)
    .where(
      and(eq(teamMemberships.organizationId, orgId), eq(teamMemberships.userId, user.id), eq(teamMemberships.isLead, true)),
    );
  const role = membership.role as OrgRole;
  return {
    organization: org,
    organizationId: orgId,
    role,
    isManager: MANAGER_ROLES.includes(role),
    isOwner: role === "owner",
    ledTeamIds: led.map((l) => l.teamId),
  };
}

export function orgContext(deps: Deps): RequestHandler {
  const handler: RequestHandler = async (req, _res, next) => {
    req.org = await resolveOrgContext(deps, String(req.params.orgId ?? ""), currentUser(req));
    next();
  };
  // Marker for the route meta-test: every :orgId route must use this.
  (handler as RequestHandler & { isOrgContext?: boolean }).isOrgContext = true;
  return handler;
}

export function requireManager(org: OrgContext) {
  if (!org.isManager) {
    throw forbidden("Only organization owners and admins can do this.", "ORG_ADMIN_REQUIRED");
  }
}

/** Platform staff (or super admin). Customers, including org admins, get 404. */
export function requireStaff(): RequestHandler {
  return (req, _res, next) => {
    const user = currentUser(req);
    if (user.platformRole !== "staff" && user.platformRole !== "superadmin") throw notFound();
    next();
  };
}

/** The hidden super-admin surface answers 404 to everyone else, staff included. */
export function requireSuperadmin(): RequestHandler {
  return (req, _res, next) => {
    const user = currentUser(req);
    if (user.platformRole !== "superadmin") throw notFound();
    next();
  };
}
