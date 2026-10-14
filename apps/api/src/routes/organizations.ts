import {
  changeRoleSchema,
  createInviteSchema,
  deletionRequestSchema,
  renameOrganizationSchema,
} from "@floppy/shared";
import { Router } from "express";
import { requireManager } from "../auth/middleware.js";
import type { Deps } from "../context.js";
import {
  cancelDeletionRequest,
  changeMemberRole,
  createInvite,
  getOrganizationDetail,
  leaveOrganization,
  listInvites,
  listMembers,
  removeMember,
  renameOrganization,
  requestDeletion,
  revokeInvite,
} from "../services/orgs.js";
import { ctx, param, parse } from "./util.js";

export function organizationRoutes(deps: Deps) {
  const r = Router({ mergeParams: true });

  r.get("/", async (req, res) => {
    res.json(await getOrganizationDetail(deps, ctx(req).org));
  });

  r.patch("/", async (req, res) => {
    const { org } = ctx(req);
    requireManager(org);
    const { name } = parse(renameOrganizationSchema, req.body);
    await renameOrganization(deps, org, name);
    res.json(await getOrganizationDetail(deps, { ...org, organization: { ...org.organization, name } }));
  });

  r.delete("/membership", async (req, res) => {
    const { org, user } = ctx(req);
    await leaveOrganization(deps, org, user.id);
    res.status(204).end();
  });

  r.get("/members", async (req, res) => {
    res.json(await listMembers(deps, ctx(req).org.organizationId));
  });

  r.patch("/members/:userId", async (req, res) => {
    const { org, user } = ctx(req);
    const { role } = parse(changeRoleSchema, req.body);
    await changeMemberRole(deps, org, user.id, param(req, "userId"), role);
    res.json(await listMembers(deps, org.organizationId));
  });

  r.delete("/members/:userId", async (req, res) => {
    const { org, user } = ctx(req);
    await removeMember(deps, org, user.id, param(req, "userId"));
    res.status(204).end();
  });

  r.get("/invites", async (req, res) => {
    const { org } = ctx(req);
    requireManager(org);
    res.json(await listInvites(deps, org));
  });

  r.post("/invites", async (req, res) => {
    const { org, user } = ctx(req);
    requireManager(org);
    res.status(201).json(await createInvite(deps, org, user, parse(createInviteSchema, req.body)));
  });

  r.delete("/invites/:inviteId", async (req, res) => {
    const { org, user } = ctx(req);
    requireManager(org);
    await revokeInvite(deps, org, user.id, param(req, "inviteId"));
    res.status(204).end();
  });

  r.post("/deletion-request", async (req, res) => {
    const { org, user } = ctx(req);
    const { reason } = parse(deletionRequestSchema, req.body);
    await requestDeletion(deps, org, user, reason);
    res.status(201).json(await getOrganizationDetail(deps, org));
  });

  r.delete("/deletion-request", async (req, res) => {
    const { org } = ctx(req);
    await cancelDeletionRequest(deps, org);
    res.status(204).end();
  });

  return r;
}
