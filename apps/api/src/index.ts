import { createServer } from "node:http";
import { clerkMiddleware, getAuth, verifyToken } from "@clerk/express";
import { verifyWebhook } from "@clerk/express/webhooks";
import { Client } from "@novu/framework";
import { serve } from "@novu/framework/express";
import { ClerkIdentity } from "./adapters/clerk.js";
import { OctokitGithub } from "./adapters/github.js";
import { DisabledNotifier, NovuNotifier } from "./adapters/novu.js";
import { SocketRealtime } from "./adapters/realtime.js";
import { OpenAiCompatibleProvider } from "./ai/openai-compatible.js";
import { createApp } from "./app.js";
import { loadConfig } from "./config.js";
import type { Deps } from "./context.js";
import { createDb } from "./db/client.js";
import { scheduleReminders } from "./jobs/reminders.js";
import { logger } from "./logger.js";
import { buildWorkflows } from "./notifications/workflows.js";

const config = loadConfig();
const { db, close } = createDb(config.DATABASE_URL, config.DATABASE_SSL);
const realtime = new SocketRealtime();
const authorizedParties = [config.WEB_ORIGIN];

const deps: Deps = {
  config,
  db,
  identity: new ClerkIdentity(config.CLERK_SECRET_KEY, config.CLERK_PUBLISHABLE_KEY),
  notifier: config.NOVU_SECRET_KEY
    ? new NovuNotifier(config.NOVU_SECRET_KEY, config.NOVU_APPLICATION_IDENTIFIER, config.NOVU_API_URL)
    : new DisabledNotifier(),
  github: new OctokitGithub(config.GITHUB_TOKEN),
  ai: config.AI_API_KEY ? new OpenAiCompatibleProvider(config.AI_API_KEY, config.AI_BASE_URL, config.AI_MODEL) : null,
  realtime,
  auth: {
    // Verifies the Clerk session token sent as `Authorization: Bearer …`.
    middleware: clerkMiddleware({
      secretKey: config.CLERK_SECRET_KEY,
      publishableKey: config.CLERK_PUBLISHABLE_KEY,
      authorizedParties,
    }),
    userIdOf: (req) => getAuth(req).userId ?? null,
    verifyToken: async (token) => {
      try {
        const payload = await verifyToken(token, { secretKey: config.CLERK_SECRET_KEY, authorizedParties });
        return payload.sub ?? null;
      } catch {
        return null;
      }
    },
  },
  now: () => new Date(),
};

const novuBridge = config.NOVU_SECRET_KEY
  ? serve({
      client: new Client({
        secretKey: config.NOVU_SECRET_KEY,
        ...(config.NOVU_API_URL ? { apiUrl: config.NOVU_API_URL } : {}),
        strictAuthentication: config.NODE_ENV === "production",
      }),
      workflows: buildWorkflows(db),
    })
  : undefined;

const { app } = createApp(deps, {
  novuBridge,
  verifyClerkWebhook: config.CLERK_WEBHOOK_SIGNING_SECRET
    ? (req) => verifyWebhook(req, { signingSecret: config.CLERK_WEBHOOK_SIGNING_SECRET })
    : undefined,
});

const server = createServer(app);
realtime.attach(server, deps);
const reminders = config.REMINDERS_ENABLED ? scheduleReminders(deps) : null;

server.listen(config.PORT, () => {
  logger.info(
    {
      port: config.PORT,
      webOrigin: config.WEB_ORIGIN,
      novu: deps.notifier.enabled,
      ai: deps.ai ? deps.ai.model : "off",
      webhooks: !!config.CLERK_WEBHOOK_SIGNING_SECRET,
      reminders: !!reminders,
    },
    "Floppy API listening",
  );
});

async function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down");
  reminders?.stop();
  server.close();
  await close();
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
