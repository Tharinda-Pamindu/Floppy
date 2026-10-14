import cors from "cors";
import express, { type RequestHandler } from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import type { WebhookEvent } from "@clerk/express/webhooks";
import { orgContext, requireUser } from "./auth/middleware.js";
import type { Deps } from "./context.js";
import { errorHandler } from "./errors.js";
import { logger } from "./logger.js";
import { chatRoutes } from "./routes/chat.js";
import { meRoutes } from "./routes/me.js";
import { organizationRoutes } from "./routes/organizations.js";
import { pageRoutes } from "./routes/pages.js";
import { planRoutes } from "./routes/plans.js";
import { staffRoutes } from "./routes/staff.js";
import { taskRoutes } from "./routes/tasks.js";
import { teamRoutes } from "./routes/teams.js";
import { handleClerkEvent } from "./services/webhooks.js";

export interface AppOptions {
  /** Verifies a Clerk (svix-signed) webhook request; absent → webhooks are disabled. */
  verifyClerkWebhook?: (req: express.Request) => Promise<WebhookEvent>;
  /** The Novu Framework bridge (`serve({ workflows })`), mounted at /api/novu. */
  novuBridge?: RequestHandler;
  /** Global per-IP request budget per minute. */
  requestsPerMinute?: number;
}

export function createApp(deps: Deps, options: AppOptions = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use(helmet());
  // The API is called with a Bearer token from the web app only. No cookies are
  // read for auth, so cross-site request forgery has nothing to ride on.
  app.use(
    cors({
      origin: deps.config.WEB_ORIGIN,
      credentials: false,
      allowedHeaders: ["Authorization", "Content-Type"],
      methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      maxAge: 600,
    }),
  );

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  // Signed webhooks need the raw body, so they come before the JSON parser.
  app.post("/webhooks/clerk", express.raw({ type: "application/json", limit: "1mb" }), async (req, res) => {
    if (!options.verifyClerkWebhook) {
      res.status(503).json({ error: { code: "WEBHOOKS_DISABLED", message: "CLERK_WEBHOOK_SIGNING_SECRET is not set." } });
      return;
    }
    let event: WebhookEvent;
    try {
      event = await options.verifyClerkWebhook(req);
    } catch {
      res.status(400).json({ error: { code: "BAD_SIGNATURE", message: "Webhook verification failed." } });
      return;
    }
    try {
      await handleClerkEvent(deps, event);
      res.json({ ok: true });
    } catch (err) {
      logger.error({ err, type: event.type }, "Clerk webhook handling failed");
      // 500 makes Clerk (svix) retry later.
      res.status(500).json({ error: { code: "WEBHOOK_FAILED", message: "Try again later." } });
    }
  });

  app.use(express.json({ limit: "300kb" }));

  // Novu's bridge verifies Novu's own HMAC signature.
  if (options.novuBridge) app.use("/api/novu", options.novuBridge);

  app.use(
    rateLimit({
      windowMs: 60_000,
      limit: options.requestsPerMinute ?? 600,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      message: { error: { code: "RATE_LIMITED", message: "Too many requests. Slow down a little." } },
    }),
  );

  app.use(deps.auth.middleware);
  app.use(requireUser(deps));

  app.use(meRoutes(deps));

  const org = express.Router({ mergeParams: true });
  // Tenancy: every route below resolves the caller's membership first.
  org.use(orgContext(deps));
  org.use("/teams", teamRoutes(deps));
  org.use("/tasks", taskRoutes(deps));
  org.use("/pages", pageRoutes(deps));
  org.use(organizationRoutes(deps));
  org.use(planRoutes(deps));
  org.use(chatRoutes(deps));
  app.use("/organizations/:orgId", org);

  app.use("/staff", staffRoutes(deps));

  app.use((_req, res) => {
    res.status(404).json({ error: { code: "NOT_FOUND", message: "Not found" } });
  });
  app.use(errorHandler);
  return { app, orgRouter: org };
}
