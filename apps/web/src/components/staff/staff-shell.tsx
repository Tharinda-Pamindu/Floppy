"use client";

import { UserButton } from "@clerk/nextjs";
import type { MeResponse } from "@floppy/shared";
import { ArrowLeft, Building2, Cpu, Gauge, KeyRound, ShieldAlert, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, useRef } from "react";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { SlidingUnderline } from "@/components/ui/sliding-underline";
import { cn } from "@/lib/utils";

export function StaffShell({ me, children }: { me: MeResponse; children: ReactNode }) {
  const pathname = usePathname();
  const nav = [
    { href: "/staff", label: "Overview", Icon: Gauge, exact: true },
    { href: "/staff/organizations", label: "Organizations", Icon: Building2 },
    { href: "/staff/users", label: "Users", Icon: Users },
    { href: "/staff/ai-usage", label: "AI usage", Icon: Cpu },
    // The super-admin page isn't even linked for anyone else.
    ...(me.platformRole === "superadmin" ? [{ href: "/staff/super", label: "Super admin", Icon: KeyRound }] : []),
  ];
  const navRef = useRef<HTMLElement>(null);
  const active = (href: string, exact?: boolean) => (exact ? pathname === href : pathname.startsWith(href));
  return (
    <div className="min-h-dvh">
      <div className="flex items-center justify-center gap-2 bg-ink px-4 py-1.5 text-center font-mono text-[11px] font-bold tracking-widest text-paper uppercase">
        <ShieldAlert className="h-3.5 w-3.5 text-brand" /> Internal staff console · metadata only — plan, chat and page content is never shown here
      </div>
      <header className="border-b-2 border-rule bg-surface">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4">
          <Logo href="/staff" compact />
          <span className="rounded-md border-2 border-rule bg-ink px-2 py-0.5 font-mono text-[11px] font-bold text-paper uppercase">{me.platformRole === "superadmin" ? "Super admin" : "Staff"}</span>
          <div className="ml-auto flex items-center gap-2">
            <Link href="/app" className="hidden items-center gap-1 text-sm font-semibold text-muted hover:text-ink sm:flex"><ArrowLeft className="h-4 w-4" />Back to app</Link>
            <ThemeToggle />
            <UserButton />
          </div>
        </div>
        <nav ref={navRef} aria-label="Staff sections" className="scrollbar-none relative mx-auto flex max-w-7xl gap-1 overflow-x-auto px-3">
          {nav.map(({ href, label, Icon, exact }) => (
            <Link key={href} href={href} aria-current={active(href, exact) ? "page" : undefined}
              className={cn("flex shrink-0 items-center gap-2 border-b-[3px] border-transparent px-3 py-2.5 text-sm font-semibold", active(href, exact) ? "text-ink" : "text-muted hover:text-ink")}>
              <Icon className="h-4 w-4" />{label}
            </Link>
          ))}
          <SlidingUnderline container={navRef} selector='[aria-current="page"]' className="bg-brand" />
        </nav>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">{children}</main>
    </div>
  );
}
