import type { Metadata } from "next";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { serverMe } from "@/lib/server-api";

export const metadata: Metadata = { title: "Super admin", robots: { index: false } };

/** Hidden: anyone who isn't a super admin — staff included — gets a 404, as from the API. */
export default async function SuperLayout({ children }: { children: ReactNode }) {
  const me = await serverMe();
  if (me?.platformRole !== "superadmin") notFound();
  return <>{children}</>;
}
