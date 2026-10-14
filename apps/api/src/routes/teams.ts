import {
  createTeamSchema,
  linkRepoSchema,
  mondayDate,
  setTeamMemberSchema,
  updateTeamSchema,
} from "@floppy/shared";
import { Router } from "express";
import { z } from "zod";
import type { Deps } from "../context.js";
import { teamHistory, teamWeek } from "../services/plans.js";
import { linkRepo, listIssues, listRepos, unlinkRepo } from "../services/repos.js";
import {
  createTeam,
  deleteTeam,
  getTeam,
  listTeams,
  removeTeamMember,
  setTeamMember,
  updateTeam,
} from "../services/teams.js";
import { ctx, param, parse } from "./util.js";

const historyQuery = z.object({
  limit: z.coerce.number().int().min(1).max(52).default(12),
  offset: z.coerce.number().int().min(0).default(0),
});
const issuesQuery = z.object({ page: z.coerce.number().int().min(1).max(50).default(1) });

export function teamRoutes(deps: Deps) {
  const r = Router({ mergeParams: true });

  r.get("/", async (req, res) => {
    res.json(await listTeams(deps, ctx(req).org));
  });

  r.post("/", async (req, res) => {
    res.status(201).json(await createTeam(deps, ctx(req).org, parse(createTeamSchema, req.body)));
  });

  r.get("/:teamId", async (req, res) => {
    res.json(await getTeam(deps, ctx(req).org, param(req, "teamId")));
  });

  r.patch("/:teamId", async (req, res) => {
    res.json(await updateTeam(deps, ctx(req).org, param(req, "teamId"), parse(updateTeamSchema, req.body)));
  });

  r.delete("/:teamId", async (req, res) => {
    await deleteTeam(deps, ctx(req).org, param(req, "teamId"));
    res.status(204).end();
  });

  r.put("/:teamId/members/:userId", async (req, res) => {
    const { isLead } = parse(setTeamMemberSchema, req.body);
    res.json(await setTeamMember(deps, ctx(req).org, param(req, "teamId"), param(req, "userId"), isLead));
  });

  r.delete("/:teamId/members/:userId", async (req, res) => {
    await removeTeamMember(deps, ctx(req).org, param(req, "teamId"), param(req, "userId"));
    res.status(204).end();
  });

  r.get("/:teamId/weeks", async (req, res) => {
    const { limit, offset } = parse(historyQuery, req.query);
    res.json(await teamHistory(deps, ctx(req).org, param(req, "teamId"), limit, offset));
  });

  r.get("/:teamId/weeks/:weekStart", async (req, res) => {
    const { org, actor } = ctx(req);
    const weekStart = parse(mondayDate, param(req, "weekStart"));
    res.json(await teamWeek(deps, org, actor, param(req, "teamId"), weekStart));
  });

  r.get("/:teamId/repos", async (req, res) => {
    res.json(await listRepos(deps, ctx(req).org, param(req, "teamId")));
  });

  r.post("/:teamId/repos", async (req, res) => {
    const { org, user } = ctx(req);
    const { repo } = parse(linkRepoSchema, req.body);
    res.status(201).json(await linkRepo(deps, org, user.id, param(req, "teamId"), repo));
  });

  r.delete("/:teamId/repos/:repoId", async (req, res) => {
    await unlinkRepo(deps, ctx(req).org, param(req, "teamId"), param(req, "repoId"));
    res.status(204).end();
  });

  r.get("/:teamId/repos/:repoId/issues", async (req, res) => {
    const { page } = parse(issuesQuery, req.query);
    res.json(await listIssues(deps, ctx(req).org, param(req, "teamId"), param(req, "repoId"), page));
  });

  return r;
}
