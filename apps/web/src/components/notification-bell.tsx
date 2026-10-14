"use client";

import type { InboxSession } from "@floppy/shared";
import { Inbox } from "@novu/react";
import { dark } from "@novu/react/themes";
import { useQuery } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { useTheme } from "next-themes";
import { useRouter } from "next/navigation";
import { useApi } from "@/lib/api";
import { cn } from "@/lib/utils";

function BellButton({ count, disabled }: { count: number; disabled?: boolean }) {
  return (
    <span
      className={cn(
        "relative grid h-10 w-10 place-items-center rounded-full border-2 border-rule bg-surface transition-colors hover:bg-surface-2",
        disabled && "opacity-60",
      )}
      aria-label={disabled ? "Notifications are not set up" : count ? `${count} unread notifications` : "Notifications"}
    >
      {disabled ? <BellOff className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
      {count > 0 && (
        <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full border-2 border-rule bg-brand px-1 font-mono text-[10px] font-bold text-white">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </span>
  );
}

/**
 * Novu's <Inbox /> with our own bell. The subscriber hash (HMAC of the user id
 * with the Novu secret) comes from the API, so nobody can open another
 * person's inbox by guessing their id.
 */
export function NotificationBell() {
  const api = useApi();
  const router = useRouter();
  const { resolvedTheme } = useTheme();
  const { data: session } = useQuery({
    queryKey: ["inbox-session"],
    queryFn: () => api<InboxSession | null>("/me/notifications/session"),
    staleTime: Infinity,
  });
  const applicationIdentifier = session?.applicationIdentifier ?? process.env.NEXT_PUBLIC_NOVU_APPLICATION_IDENTIFIER;

  if (!session || !applicationIdentifier) return <BellButton count={0} disabled />;
  const isDark = resolvedTheme === "dark";

  return (
    <Inbox
      applicationIdentifier={applicationIdentifier}
      subscriber={session.subscriberId}
      subscriberHash={session.subscriberHash ?? undefined}
      backendUrl={process.env.NEXT_PUBLIC_NOVU_BACKEND_URL || undefined}
      socketUrl={process.env.NEXT_PUBLIC_NOVU_SOCKET_URL || undefined}
      routerPush={(path: string) => router.push(path)}
      placement="bottom-end"
      renderBell={(unread) => <BellButton count={unread.total} />}
      appearance={{
        baseTheme: isDark ? dark : undefined,
        variables: {
          colorPrimary: isDark ? "#2dd4bf" : "#0f766e",
          colorBackground: isDark ? "#151a21" : "#fffdf8",
          colorForeground: isDark ? "#ede8dd" : "#1c1917",
          borderRadius: "12px",
          fontSize: "14px",
        },
        elements: {
          popoverContent: "border-2 border-[var(--rule)] shadow-[4px_4px_0_0_var(--shadow-ink)] rounded-[14px]",
        },
      }}
    />
  );
}
