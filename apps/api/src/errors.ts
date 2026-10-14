import type { ErrorRequestHandler } from "express";
import { ZodError } from "zod";
import { logger } from "./logger.js";

/** An error the client is allowed to see, in plain words. */
export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message);
  }
}

export const notFound = (what = "Not found") => new AppError(404, "NOT_FOUND", what);
export const forbidden = (message: string, code = "FORBIDDEN") => new AppError(403, code, message);
export const conflict = (message: string, code = "CONFLICT", field?: string) =>
  new AppError(409, code, message, field);
export const invalid = (message: string, field?: string) => new AppError(422, "VALIDATION_ERROR", message, field);
export const unauthorized = () => new AppError(401, "UNAUTHENTICATED", "Sign in to continue.");

export function zodToAppError(error: ZodError) {
  const fields: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_";
    fields[key] ??= issue.message;
  }
  const first = error.issues[0];
  return {
    status: 422,
    body: {
      error: {
        code: "VALIDATION_ERROR",
        message: first?.message ?? "Check the highlighted fields.",
        field: first?.path.join(".") || undefined,
        fields,
      },
    },
  };
}

export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof ZodError) {
    const { status, body } = zodToAppError(err);
    res.status(status).json(body);
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, field: err.field } });
    return;
  }
  // Malformed JSON from express.json()
  if (err?.type === "entity.parse.failed") {
    res.status(400).json({ error: { code: "BAD_JSON", message: "The request body isn't valid JSON." } });
    return;
  }
  if (err?.type === "entity.too.large") {
    res.status(413).json({ error: { code: "TOO_LARGE", message: "That request is too large." } });
    return;
  }
  logger.error({ err, path: req.path }, "Unhandled error");
  res.status(500).json({ error: { code: "INTERNAL", message: "Something went wrong on our side. Try again." } });
};
