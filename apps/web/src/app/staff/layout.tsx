import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { StaffShell } from "@/components/staff/staff-shell";
import { serverMe } from "@/lib/server-api";

export const metadata: Metadata = { title: { default: "Staff console", template: "%s · Floppy staff" }, robots: { index: false } };

/**
 * Platform staff only. Everyone else — including organization owners and
 * admins — gets a 404, exactly like the API.
 */
export default async function StaffLayout({ children }: { children: ReactNode }) {
  const me = await serverMe();
  if (!me || me.platformRole === "none") notFound();
  return <StaffShell me={me}>{children}</StaffShell>;
}
