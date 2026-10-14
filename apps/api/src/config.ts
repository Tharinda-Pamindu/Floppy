import { z } from "zod";

/**
 * Every setting comes from the environment (apps/api/.env in development).
 * Secrets are never hard-coded; the API refuses to start when a required one
 * is missing. Optional integrations (Novu, GitHub token, AI) degrade
 * gracefully when their keys are absent.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().default(4000),
  /** Origin of the Next.js app; the only origin CORS and Socket.IO accept. */
  WEB_ORIGIN: z.url().default("http://localhost:3000"),
  /** Public URL of this API (used for the Novu bridge). */
  API_PUBLIC_URL: z.url().default("http://localhost:4000"),

  DATABASE_URL: z.string().min(1, "DATABASE_URL is required (Supabase connection string)."),
  DATABASE_SSL: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  CLERK_SECRET_KEY: z.string().min(1, "CLERK_SECRET_KEY is required."),
  CLERK_PUBLISHABLE_KEY: z.string().min(1, "CLERK_PUBLISHABLE_KEY is required."),
  CLERK_WEBHOOK_SIGNING_SECRET: z.string().optional(),
  /** Route Clerk's auth emails/SMS through Novu (needs Clerk templates set to "delivered by you"). */
  CLERK_EMAILS_VIA_NOVU: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  NOVU_SECRET_KEY: z.string().optional(),
  NOVU_APPLICATION_IDENTIFIER: z.string().optional(),
  /** EU customers: https://eu.api.novu.co */
  NOVU_API_URL: z.url().optional(),

  GITHUB_TOKEN: z.string().optional(),

  /** AI is on hold: leave AI_API_KEY empty and the AI features stay hidden. */
  AI_API_KEY: z.string().optional(),
  AI_BASE_URL: z.url().default("https://api.groq.com/openai/v1"),
  AI_MODEL: z.string().default("llama-3.3-70b-versatile"),
  AI_TIMEOUT_SECONDS: z.coerce.number().positive().default(30),
  AI_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().positive().default(6),

  /** Turn the reminder cron off (e.g. on a second API instance). */
  REMINDERS_ENABLED: z
    .enum(["true", "false"])
    .default("true")
    .transform((v) => v === "true"),

  DEMO_PASSWORD: z.string().optional(),
});

export type Config = z.infer<typeof schema>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    const problems = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${problems}\nSee apps/api/.env.example.`);
  }
  return parsed.data;
}
