import {
  approveSchema,
  brainDumpSchema,
  completePlanSchema,
  createPlanSchema,
  listPlansQuery,
  requestChangesSchema,
  tickTaskSchema,
  updatePlanSchema,
} from "@floppy/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { currentUser } from "../auth/middleware.js";
import type { Deps } from "../context.js";
import { draftPlan, reviewPlan } from "../services/ai.js";
import {
  approvePlan,
  completePlan,
  createPlan,
  getReadablePlan,
  listAwaitingApproval,
  listMyPlans,
  replaceTasks,
  requestChanges,
  setTaskDone,
  submitPlan,
  toPlanDto,
  withdrawPlan,
} from "../services/plans.js";
import { openTasksFor } from "../services/tasks.js";
import { ctx, param, parse } from "./util.js";

export function planRoutes(deps: Deps) {
  const r = Router({ mergeParams: true });
  // A coarse per-user guard in front of the per-minute AI limit recorded in the database.
  const aiLimiter = rateLimit({
    windowMs: 60_000,
    limit: 20,
    keyGenerator: (req) => currentUser(req).id,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  });

  r.get("/plans", async (req, res) => {
    res.json(await listMyPlans(deps, ctx(req).actor, parse(listPlansQuery, req.query)));
  });

  r.post("/plans", async (req, res) => {
    const { actor } = ctx(req);
    const plan = await createPlan(deps, actor, parse(createPlanSchema, req.body));
    res.status(201).json(await toPlanDto(deps, actor, plan));
  });

  r.get("/approvals", async (req, res) => {
    res.json(await listAwaitingApproval(deps, ctx(req).actor));
  });

  r.get("/plans/open-assigned-tasks", async (req, res) => {
    const { org, user } = ctx(req);
    res.json(await openTasksFor(deps, org, user.id));
  });

  r.get("/plans/:planId", async (req, res) => {
    const { actor } = ctx(req);
    res.json(await toPlanDto(deps, actor, await getReadablePlan(deps, actor, param(req, "planId"))));
  });

  r.put("/plans/:planId", async (req, res) => {
    const { actor } = ctx(req);
    const plan = await getReadablePlan(deps, actor, param(req, "planId"));
    await replaceTasks(deps, actor, plan, parse(updatePlanSchema, req.body).tasks);
    res.json(await toPlanDto(deps, actor, await getReadablePlan(deps, actor, plan.id)));
  });

  r.patch("/plans/:planId/tasks/:taskId", async (req, res) => {
    const { actor } = ctx(req);
    const plan = await getReadablePlan(deps, actor, param(req, "planId"));
    await setTaskDone(deps, actor, plan, param(req, "taskId"), parse(tickTaskSchema, req.body).isDone);
    res.json(await toPlanDto(deps, actor, plan));
  });

  const transition =
    (run: (r: ReturnType<typeof ctx>, plan: Awaited<ReturnType<typeof getReadablePlan>>, body: unknown) => Promise<void>) =>
    async (req: import("express").Request, res: import("express").Response) => {
      const c = ctx(req);
      const plan = await getReadablePlan(deps, c.actor, param(req, "planId"));
      await run(c, plan, req.body);
      res.json(await toPlanDto(deps, c.actor, await getReadablePlan(deps, c.actor, plan.id).catch(() => plan)));
    };

  r.post("/plans/:planId/submit", transition((c, plan) => submitPlan(deps, c.actor, plan, c.user)));
  r.post("/plans/:planId/withdraw", transition((c, plan) => withdrawPlan(deps, c.actor, plan)));
  r.post(
    "/plans/:planId/approve",
    transition((c, plan, body) => approvePlan(deps, c.actor, plan, c.user, parse(approveSchema, body).comment ?? null)),
  );
  r.post(
    "/plans/:planId/request-changes",
    transition((c, plan, body) => requestChanges(deps, c.actor, plan, c.user, parse(requestChangesSchema, body).comment)),
  );
  r.post(
    "/plans/:planId/complete",
    transition((c, plan, body) => completePlan(deps, c.actor, plan, parse(completePlanSchema, body))),
  );

  r.post("/plans/:planId/ai-review", aiLimiter, async (req, res) => {
    const { actor } = ctx(req);
    const plan = await getReadablePlan(deps, actor, param(req, "planId"));
    await reviewPlan(deps, actor, plan);
    res.json(await toPlanDto(deps, actor, await getReadablePlan(deps, actor, plan.id)));
  });

  r.post("/ai/plan-drafts", aiLimiter, async (req, res) => {
    const { actor } = ctx(req);
    res.json(await draftPlan(deps, actor, parse(brainDumpSchema, req.body).notes));
  });

  return r;
}
