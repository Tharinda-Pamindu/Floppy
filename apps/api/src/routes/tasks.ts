import {
  createAssignedTaskSchema,
  listAssignedTasksQuery,
  pullIntoPlanSchema,
  updateAssignedTaskSchema,
} from "@floppy/shared";
import { Router } from "express";
import type { Deps } from "../context.js";
import {
  createTask,
  getVisibleTask,
  listTasks,
  pullIntoPlan,
  refreshGithubState,
  toTaskDtos,
  updateTask,
} from "../services/tasks.js";
import { listTaskEvents } from "../services/task-events.js";
import { ctx, param, parse } from "./util.js";

export function taskRoutes(deps: Deps) {
  const r = Router({ mergeParams: true });

  r.get("/", async (req, res) => {
    const { org, user } = ctx(req);
    res.json(await listTasks(deps, org, user.id, parse(listAssignedTasksQuery, req.query)));
  });

  r.post("/", async (req, res) => {
    const { org, user } = ctx(req);
    const task = await createTask(deps, org, user, parse(createAssignedTaskSchema, req.body));
    res.status(201).json((await toTaskDtos(deps, org, user.id, [task]))[0]);
  });

  r.get("/:taskId", async (req, res) => {
    const { org, user } = ctx(req);
    const task = await refreshGithubState(deps, await getVisibleTask(deps, org, user.id, param(req, "taskId")));
    res.json((await toTaskDtos(deps, org, user.id, [task]))[0]);
  });

  r.patch("/:taskId", async (req, res) => {
    const { org, user } = ctx(req);
    const task = await getVisibleTask(deps, org, user.id, param(req, "taskId"));
    const updated = await updateTask(deps, org, user, task, parse(updateAssignedTaskSchema, req.body));
    const visible = await getVisibleTask(deps, org, user.id, updated.id).catch(() => null);
    if (!visible) {
      // Reassigned away from someone who can no longer see it.
      res.status(204).end();
      return;
    }
    res.json((await toTaskDtos(deps, org, user.id, [visible]))[0]);
  });

  // The task's history (Jira's History tab). Same visibility as the task itself: others get 404.
  r.get("/:taskId/activity", async (req, res) => {
    const { org, user } = ctx(req);
    const task = await getVisibleTask(deps, org, user.id, param(req, "taskId"));
    res.json(await listTaskEvents(deps.db, task.id));
  });

  r.post("/:taskId/pull-into-plan", async (req, res) => {
    const { org, user, actor } = ctx(req);
    const task = await getVisibleTask(deps, org, user.id, param(req, "taskId"));
    const plan = await pullIntoPlan(deps, org, actor, task, parse(pullIntoPlanSchema, req.body));
    res.status(201).json({ planId: plan.id, weekStart: plan.weekStart });
  });

  return r;
}
