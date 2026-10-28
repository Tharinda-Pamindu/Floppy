import "server-only";
import { auth } from "@clerk/nextjs/server";
import type { MeResponse } from "@floppy/shared";

const PUBLIC_API_URL = process.env.NODE_ENV === "production" ? "/api" : (process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000");

// Server-side fetch requires an absolute URL. In a single dyno, use its own port.
const API_URL = PUBLIC_API_URL.startsWith("/")
  ? `http://127.0.0.1:${process.env.PORT ?? 4000}${PUBLIC_API_URL}`
  : PUBLIC_API_URL;

/** The signed-in user as the API sees them (null when the API refuses or is unreachable). */
export async function serverMe(): Promise<MeResponse | null> {
  const { getToken } = await auth();
  const token = await getToken();
  if (!token) return null;
  try {
    const res = await fetch(`${API_URL}/me`, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as MeResponse;
  } catch {
    return null;
  }
}
