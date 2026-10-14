import { createOrganizationSchema, updatePreferencesSchema, updateSettingsSchema } from "@floppy/shared";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { currentUser } from "../auth/middleware.js";
import type { Deps } from "../context.js";
import { createOrganization, listMyOrganizations } from "../services/orgs.js";
import { getMe, requireNotifications, sendTestNotification, updateSettings } from "../services/me.js";
import { parse } from "./util.js";

export function meRoutes(deps: Deps) {
  const r = Router();

  r.get("/me", async (req, res) => {
    res.json(await getMe(deps, currentUser(req)));
  });

  r.patch("/me/settings", async (req, res) => {
    res.json(await updateSettings(deps, currentUser(req), parse(updateSettingsSchema, req.body)));
  });

  r.get("/me/notifications/session", (req, res) => {
    res.json(deps.notifier.inboxSession(currentUser(req).id));
  });

  r.get("/me/notifications/preferences", async (req, res) => {
    requireNotifications(deps);
    res.json(await deps.notifier.getPreferences(currentUser(req).id));
  });

  r.patch("/me/notifications/preferences", async (req, res) => {
    requireNotifications(deps);
    const input = parse(updatePreferencesSchema, req.body);
    await deps.notifier.updatePreferences(currentUser(req).id, input);
    res.json(await deps.notifier.getPreferences(currentUser(req).id));
  });

  r.post(
    "/me/notifications/test",
    rateLimit({ windowMs: 60_000, limit: 3, keyGenerator: (req) => currentUser(req).id, standardHeaders: "draft-8", legacyHeaders: false }),
    async (req, res) => {
      res.json(await sendTestNotification(deps, currentUser(req)));
    },
  );

  r.get("/ai/status", (_req, res) => {
    res.json({ enabled: deps.ai !== null, model: deps.ai?.model ?? null });
  });

  r.get("/organizations", async (req, res) => {
    res.json(await listMyOrganizations(deps, currentUser(req)));
  });

  r.post("/organizations", async (req, res) => {
    const input = parse(createOrganizationSchema, req.body);
    res.status(201).json(await createOrganization(deps, currentUser(req), input));
  });

  return r;
}
