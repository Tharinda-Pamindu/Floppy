import "server-only";
import { auth } from "@clerk/nextjs/server";
import type { MeResponse } from "@floppy/shared";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

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
