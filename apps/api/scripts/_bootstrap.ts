/** Builds the same dependencies the server uses, for one-off CLI scripts. */
import { ClerkIdentity } from "../src/adapters/clerk.js";
import { OctokitGithub } from "../src/adapters/github.js";
import { DisabledNotifier, NovuNotifier } from "../src/adapters/novu.js";
import { loadConfig } from "../src/config.js";
import type { Deps } from "../src/context.js";
import { createDb } from "../src/db/client.js";
import type { Notifier } from "../src/ports.js";

export function bootstrap(options: { quietNotifications?: boolean } = {}) {
  const config = loadConfig();
  const { db, close } = createDb(config.DATABASE_URL, config.DATABASE_SSL);
  let notifier: Notifier = config.NOVU_SECRET_KEY
    ? new NovuNotifier(config.NOVU_SECRET_KEY, config.NOVU_APPLICATION_IDENTIFIER, config.NOVU_API_URL)
    : new DisabledNotifier();
  if (options.quietNotifications) {
    // Keep subscriber management, drop triggers (the seed shouldn't email anyone).
    const inner = notifier;
    notifier = Object.assign(Object.create(Object.getPrototypeOf(inner)), inner, {
      trigger: async () => undefined,
      triggerInline: async () => undefined,
    }) as Notifier;
  }
  const deps: Deps = {
    config,
    db,
    identity: new ClerkIdentity(config.CLERK_SECRET_KEY, config.CLERK_PUBLISHABLE_KEY),
    notifier,
    github: new OctokitGithub(config.GITHUB_TOKEN),
    ai: null,
    realtime: { toConversation() {}, toUser() {} },
    auth: {
      middleware: (_req, _res, next) => next(),
      userIdOf: () => null,
      verifyToken: async () => null,
    },
    now: () => new Date(),
  };
  return { deps, config, close };
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export const flag = (name: string) => process.argv.includes(`--${name}`);
