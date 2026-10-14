/** Minimal structured logger. Never log secrets, tokens, message bodies or plan text. */
type Fields = Record<string, unknown>;

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === "test" ? "silent" : "info");
const order = { debug: 10, info: 20, warn: 30, error: 40, silent: 100 } as const;
const threshold = order[level as keyof typeof order] ?? 20;

function write(lvl: keyof typeof order, fields: Fields, msg: string) {
  if (order[lvl] < threshold) return;
  const { err, ...rest } = fields;
  const error =
    err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : err ? String(err) : undefined;
  const line = JSON.stringify({ t: new Date().toISOString(), level: lvl, msg, ...rest, ...(error ? { err: error } : {}) });
  (lvl === "error" || lvl === "warn" ? console.error : console.log)(line);
}

export const logger = {
  debug: (fields: Fields, msg: string) => write("debug", fields, msg),
  info: (fields: Fields, msg: string) => write("info", fields, msg),
  warn: (fields: Fields, msg: string) => write("warn", fields, msg),
  error: (fields: Fields, msg: string) => write("error", fields, msg),
};
