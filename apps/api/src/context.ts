import type { Request } from "express";
import type { Config } from "./config.js";
import type { Db } from "./db/client.js";
import type { AiProvider, GithubClient, IdentityProvider, Notifier, Realtime } from "./ports.js";

/** Everything a request handler or job needs, injected once at start-up. */
export interface Deps {
  config: Pick<
    Config,
    | "WEB_ORIGIN"
    | "API_PUBLIC_URL"
    | "AI_TIMEOUT_SECONDS"
    | "AI_RATE_LIMIT_PER_MINUTE"
    | "CLERK_EMAILS_VIA_NOVU"
    | "NODE_ENV"
  >;
  db: Db;
  identity: IdentityProvider;
  notifier: Notifier;
  github: GithubClient;
  ai: AiProvider | null;
  realtime: Realtime;
  /** Reads the signed-in Clerk user id from a request (null when signed out). */
  auth: {
    middleware: import("express").RequestHandler;
    userIdOf(req: Request): string | null;
    /** Verifies a raw session token (used for the Socket.IO handshake). */
    verifyToken(token: string): Promise<string | null>;
  };
  now: () => Date;
}
