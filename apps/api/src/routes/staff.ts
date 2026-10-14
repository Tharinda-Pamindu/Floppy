import {
  aiEventsQuery,
  aiUsageQuery,
  createCustomerSchema,
  createStaffSchema,
  decideDeletionSchema,
  setPasswordSchema,
  staffListQuery,
  suspendOrgSchema,
  suspendOwnerSchema,
  updateUserSchema,
} from "@floppy/shared";
import { Router } from "express";
import { z } from "zod";
import { currentUser, requireStaff, requireSuperadmin } from "../auth/middleware.js";
import type { Deps } from "../context.js";
import {
  aiUsageEventsList,
  aiUsageSummary,
  createCustomer,
  getOrganization,
  getUser,
  listOrganizations,
  listUsers,
  overview,
  reinstateOrganization,
  setPassword,
  suspendOrganization,
  updateUser,
} from "../services/platform.js";
import {
  auditLog,
  createStaff,
  decideDeletion,
  listDeletionRequests,
  listOwners,
  listStaff,
  reinstateOwner,
  setStaffActive,
  suspendOwner,
} from "../services/superadmin.js";
import { personRef } from "../services/people.js";
import { param, parse } from "./util.js";

/** Platform staff console. Customers (org owners and admins included) get 404. */
export function staffRoutes(deps: Deps) {
  const r = Router();
  r.use(requireStaff());

  r.get("/overview", async (_req, res) => {
    res.json(await overview(deps));
  });

  r.get("/organizations", async (req, res) => {
    res.json(await listOrganizations(deps, parse(staffListQuery, req.query)));
  });
  r.get("/organizations/:orgId", async (req, res) => {
    res.json(await getOrganization(deps, param(req, "orgId")));
  });
  r.post("/organizations/:orgId/suspend", async (req, res) => {
    await suspendOrganization(deps, currentUser(req), param(req, "orgId"), parse(suspendOrgSchema, req.body).reason);
    res.json(await getOrganization(deps, param(req, "orgId")));
  });
  r.post("/organizations/:orgId/reinstate", async (req, res) => {
    await reinstateOrganization(deps, currentUser(req), param(req, "orgId"));
    res.json(await getOrganization(deps, param(req, "orgId")));
  });

  r.get("/users", async (req, res) => {
    res.json(await listUsers(deps, parse(staffListQuery, req.query)));
  });
  r.post("/users", async (req, res) => {
    res.status(201).json(await createCustomer(deps, currentUser(req), parse(createCustomerSchema, req.body)));
  });
  r.get("/users/:userId", async (req, res) => {
    res.json(await getUser(deps, param(req, "userId")));
  });
  r.patch("/users/:userId", async (req, res) => {
    res.json(await updateUser(deps, currentUser(req), param(req, "userId"), parse(updateUserSchema, req.body)));
  });
  r.post("/users/:userId/password", async (req, res) => {
    await setPassword(deps, currentUser(req), param(req, "userId"), parse(setPasswordSchema, req.body).password);
    res.status(204).end();
  });

  r.get("/ai-usage/summary", async (req, res) => {
    res.json(await aiUsageSummary(deps, parse(aiUsageQuery, req.query).days));
  });
  r.get("/ai-usage/events", async (req, res) => {
    res.json(await aiUsageEventsList(deps, parse(aiEventsQuery, req.query)));
  });

  // -- Hidden super-admin surface: 404 to everyone else, staff included. -----------
  const s = Router();
  s.use(requireSuperadmin());

  s.get("/staff", async (_req, res) => {
    res.json(await listStaff(deps));
  });
  s.post("/staff", async (req, res) => {
    const { user, password } = await createStaff(deps, currentUser(req), parse(createStaffSchema, req.body));
    // The generated password is shown exactly once.
    res.status(201).json({ user: personRef(user), password });
  });
  s.post("/staff/:userId/deactivate", async (req, res) => {
    await setStaffActive(deps, currentUser(req), param(req, "userId"), false);
    res.status(204).end();
  });
  s.post("/staff/:userId/reactivate", async (req, res) => {
    await setStaffActive(deps, currentUser(req), param(req, "userId"), true);
    res.status(204).end();
  });

  s.get("/owners", async (_req, res) => {
    res.json(await listOwners(deps));
  });
  s.post("/owners/:userId/suspend", async (req, res) => {
    await suspendOwner(deps, currentUser(req), param(req, "userId"), parse(suspendOwnerSchema, req.body).reason);
    res.status(204).end();
  });
  s.post("/owners/:userId/reinstate", async (req, res) => {
    await reinstateOwner(deps, currentUser(req), param(req, "userId"));
    res.status(204).end();
  });

  s.get("/deletion-requests", async (req, res) => {
    const { status } = parse(z.object({ status: z.enum(["pending", "approved", "rejected", "cancelled"]).optional() }), req.query);
    res.json(await listDeletionRequests(deps, status));
  });
  s.post("/deletion-requests/:requestId/decision", async (req, res) => {
    await decideDeletion(deps, currentUser(req), param(req, "requestId"), parse(decideDeletionSchema, req.body));
    res.status(204).end();
  });

  s.get("/audit", async (_req, res) => {
    res.json(await auditLog(deps));
  });

  r.use("/super", s);
  return r;
}
