"use client";

import { UserButton } from "@clerk/nextjs";
import type { OrganizationDetail, OrganizationSummary } from "@floppy/shared";
import {
  CalendarCheck2,
  CalendarDays,
  Check,
  ChevronsUpDown,
  CircleDot,
  FileText,
  History,
  Inbox as InboxIcon,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  Settings,
  Shield,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { useApprovals, useConversations, useMe, useOrgs } from "@/lib/queries";
import { cn, LAST_ORG_KEY } from "@/lib/utils";
import { Logo } from "./brand";
import { NotificationBell } from "./notification-bell";
import { ThemeToggle } from "./theme-toggle";
import { Menu, MenuItem, MenuSeparator } from "./ui/misc";
import { SlidingUnderline } from "./ui/sliding-underline";

const OrgContext = createContext<OrganizationDetail | null>(null);
export function useOrgContext() {
  const ctx = useContext(OrgContext);
  if (!ctx) throw new Error("useOrgContext outside an organization");
  return ctx;
}
export const OrgProvider = OrgContext.Provider;

type NavItem = { href: string; label: string; Icon: typeof CalendarCheck2; badge?: number };

export function AppShell({ org, children }: { org: OrganizationDetail; children: ReactNode }) {
  const pathname = usePathname();
  const base = `/app/${org.id}`;
  const approvals = useApprovals(org.id);
  const conversations = useConversations(org.id);
  const unread = (conversations.data ?? []).reduce((n, c) => n + c.unread, 0);

  useEffect(() => {
    try {
      localStorage.setItem(LAST_ORG_KEY, org.id);
    } catch {
      // storage unavailable (private mode); the org list still works
    }
  }, [org.id]);

  const nav: NavItem[] = [
    { href: `${base}/week`, label: "My week", Icon: CalendarCheck2 },
    { href: `${base}/approvals`, label: "Approvals", Icon: InboxIcon, badge: approvals.data?.length },
    { href: `${base}/tasks`, label: "Tasks", Icon: CircleDot },
    { href: `${base}/calendar`, label: "Calendar", Icon: CalendarDays },
    { href: `${base}/chat`, label: "Chat", Icon: MessagesSquare, badge: unread },
    { href: `${base}/teams`, label: "Teams", Icon: Users },
    { href: `${base}/pages`, label: "Pages", Icon: FileText },
    { href: `${base}/history`, label: "History", Icon: History },
    { href: `${base}/settings`, label: "Organization", Icon: Settings },
  ];
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const sectionsRef = useRef<HTMLElement>(null);
  const mobilePrimary = nav.filter((n) => ["My week", "Tasks", "Chat", "Teams"].includes(n.label));
  const mobileMore = nav.filter((n) => !mobilePrimary.includes(n));

  return (
    <OrgProvider value={org}>
      <div className="min-h-dvh pb-20 md:pb-0">
        <header className="sticky top-0 z-40 border-b border-rule bg-paper/95 backdrop-blur">
          <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4">
            <Logo href="/app" compact />
            <OrgSwitcher current={org} />
            <div className="ml-auto flex items-center gap-2">
              <ThemeToggle className="hidden sm:inline-flex" />
              <NotificationBell />
              <AccountMenu orgId={org.id} />
            </div>
          </div>
          <nav ref={sectionsRef} aria-label="Sections" className="scrollbar-none relative mx-auto hidden max-w-7xl gap-1 overflow-x-auto px-3 md:flex">
            {nav.map(({ href, label, Icon, badge }) => (
              <Link
                key={href}
                href={href}
                aria-current={isActive(href) ? "page" : undefined}
                className={cn(
                  "flex shrink-0 items-center gap-2 border-b-2 border-transparent px-3 py-2.5 text-[12px] font-semibold tracking-[0.06em] uppercase transition-colors",
                  isActive(href) ? "text-ink" : "text-muted hover:text-ink",
                )}
              >
                <Icon className="h-4 w-4" />
                {label}
                {!!badge && <span className="rounded-full bg-accent px-1.5 text-[10px] font-semibold text-accent-ink">{badge}</span>}
              </Link>
            ))}
            <SlidingUnderline container={sectionsRef} selector='[aria-current="page"]' />
          </nav>
        </header>

        {org.suspended && (
          <div className="border-b border-rule bg-warn-soft px-4 py-2 text-center text-sm font-semibold text-warn">This organization is suspended.</div>
        )}

        <main className="mx-auto max-w-7xl px-4 py-6 md:py-8">{children}</main>

        {/* Mobile bottom tab bar */}
        <nav aria-label="Sections" className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-rule bg-surface md:hidden">
          {mobilePrimary.map(({ href, label, Icon, badge }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className={cn("relative flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", isActive(href) ? "text-accent" : "text-muted")}>
              <Icon className="h-5 w-5" />
              {label === "My week" ? "Week" : label}
              {!!badge && <span className="absolute top-1 right-[calc(50%-18px)] h-2 w-2 rounded-full bg-accent" />}
            </Link>
          ))}
          <Menu
            align="end"
            trigger={
              <button className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] font-semibold", mobileMore.some((n) => isActive(n.href)) ? "text-accent" : "text-muted")}>
                <MoreHorizontal className="h-5 w-5" />
                More
              </button>
            }
          >
            {mobileMore.map(({ href, label, Icon, badge }) => (
              <MenuItem key={href} href={href}>
                <Icon className="h-4 w-4" /> {label} {!!badge && <span className="ml-auto font-mono text-xs">{badge}</span>}
              </MenuItem>
            ))}
            <MenuItem href={`/app/${org.id}/notifications`}>
              <SlidersHorizontal className="h-4 w-4" /> Notification settings
            </MenuItem>
            <div className="px-2.5 py-2"><ThemeToggle /></div>
          </Menu>
        </nav>
      </div>
    </OrgProvider>
  );
}

function OrgSwitcher({ current }: { current: OrganizationSummary }) {
  const orgs = useOrgs();
  return (
    <Menu
      align="start"
      trigger={
        <button className="flex min-w-0 items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1.5 text-sm font-bold hover:bg-surface-2">
          <span className="max-w-[40vw] truncate sm:max-w-56">{current.name}</span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-muted" />
        </button>
      }
    >
      <div className="px-2.5 py-1.5 text-[10px] font-semibold tracking-wider text-muted uppercase">Organizations</div>
      {(orgs.data ?? []).map((o) => (
        <MenuItem key={o.id} href={`/app/${o.id}/week`} disabled={o.suspended}>
          <span className="truncate">{o.name}</span>
          {o.suspended && <span className="ml-auto font-mono text-[10px] text-warn">SUSPENDED</span>}
          {o.id === current.id && <Check className="ml-auto h-4 w-4 text-accent" />}
        </MenuItem>
      ))}
      <MenuSeparator />
      <MenuItem href="/app/welcome">
        <Plus className="h-4 w-4" /> New organization
      </MenuItem>
    </Menu>
  );
}

function AccountMenu({ orgId }: { orgId: string }) {
  const me = useMe();
  const isStaff = me.data && me.data.platformRole !== "none";
  return (
    <div className="flex items-center gap-2">
      <Link href={`/app/${orgId}/notifications`} className="hidden h-10 w-10 place-items-center rounded-full border border-rule bg-surface hover:bg-surface-2 sm:grid" aria-label="Notification settings" title="Notification settings">
        <SlidersHorizontal className="h-4 w-4" />
      </Link>
      {isStaff && (
        <Link href="/staff" className="hidden h-10 items-center gap-1.5 rounded-full border border-rule bg-ink px-3 text-xs font-bold text-paper sm:flex" title="Staff console">
          <Shield className="h-3.5 w-3.5" /> Staff
        </Link>
      )}
      <UserButton appearance={{ elements: { avatarBox: "h-10 w-10 border border-[var(--rule)]" } }} />
    </div>
  );
}
