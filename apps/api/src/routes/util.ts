import type { Request } from "express";
import type { z } from "zod";
import { currentOrg, currentUser } from "../auth/middleware.js";
import { actorOf } from "../services/plans.js";

/** Validate input with a shared zod schema; a ZodError becomes a 422 in errorHandler. */
export function parse<S extends z.ZodType>(schema: S, data: unknown): z.infer<S> {
  return schema.parse(data ?? {});
}

export function param(req: Request, name: string): string {
  const value = req.params[name];
  return typeof value === "string" ? value : "";
}

/** The signed-in user, the org in the URL and the "actor" view of both. */
export function ctx(req: Request) {
  const user = currentUser(req);
  const org = currentOrg(req);
  return { user, org, actor: actorOf(org, user) };
}
