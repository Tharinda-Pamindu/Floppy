"use client";

import { useAuth } from "@clerk/nextjs";
import type { ApiErrorBody } from "@floppy/shared";
import { useCallback } from "react";

export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

/** A non-2xx answer from the API, in plain words. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly field?: string,
    public readonly fields?: Record<string, string>,
  ) {
    super(message);
  }
}

export function errorMessage(err: unknown, fallback = "Something went wrong. Try again."): string {
  if (err instanceof ApiError) return err.message || fallback;
  if (err instanceof TypeError) return "Can't reach the server. Check your connection and try again.";
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export type ApiFetch = <T = unknown>(path: string, init?: RequestInit & { json?: unknown; raw?: boolean }) => Promise<T>;

/**
 * Calls the Floppy API with the Clerk session token as a Bearer header.
 * Cookies are never sent to the API, so it has no CSRF surface.
 */
export function useApi(): ApiFetch {
  const { getToken } = useAuth();
  return useCallback(
    async function apiFetch<T>(path: string, init: RequestInit & { json?: unknown; raw?: boolean } = {}): Promise<T> {
      const token = await getToken();
      const headers = new Headers(init.headers);
      if (token) headers.set("Authorization", `Bearer ${token}`);
      let body = init.body;
      if (init.json !== undefined) {
        headers.set("Content-Type", "application/json");
        body = JSON.stringify(init.json);
      }
      const res = await fetch(`${API_URL}${path}`, { ...init, headers, body, credentials: "omit", cache: "no-store" });
      if (init.raw) {
        if (!res.ok) throw await toError(res);
        return res as unknown as T;
      }
      if (res.status === 204) return undefined as T;
      if (!res.ok) throw await toError(res);
      return (await res.json()) as T;
    },
    [getToken],
  ) as ApiFetch;
}

async function toError(res: Response): Promise<ApiError> {
  let body: Partial<ApiErrorBody> = {};
  try {
    body = (await res.json()) as ApiErrorBody;
  } catch {
    // not JSON
  }
  const e = body.error;
  const fallback =
    res.status === 401
      ? "Your session ended. Sign in again."
      : res.status === 404
        ? "Not found."
        : res.status === 429
          ? "Too many requests. Wait a moment and try again."
          : "Something went wrong. Try again.";
  return new ApiError(res.status, e?.code ?? `HTTP_${res.status}`, e?.message ?? fallback, e?.field, e?.fields);
}
