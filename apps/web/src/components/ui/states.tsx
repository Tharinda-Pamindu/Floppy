"use client";

import { AlertTriangle, Lock, PauseCircle, SearchX, WifiOff } from "lucide-react";
import Link from "next/link";
import { type ReactNode, useEffect, useId, useState } from "react";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-5 w-5 animate-spin rounded-full border-[3px] border-accent border-t-transparent", className)} aria-label="Loading" role="status" />;
}

/**
 * Quick loads show the small spinner. Once a load takes longer than `slowAfter`
 * ms, the animated Floppy mark takes over, so a long wait doesn't look stuck.
 */
export function PageLoader({ label = "Loading…", slowAfter = 800 }: { label?: string; slowAfter?: number }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), slowAfter);
    return () => clearTimeout(timer);
  }, [slowAfter]);
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted">
      {slow ? <LogoLoader /> : <Spinner className="h-8 w-8" />}
      <span>{label}</span>
    </div>
  );
}

/** The Floppy mark bobbing over soft brand-coloured ripples and a faded paper grid (styles in globals.css). */
function LogoLoader() {
  // The F is cut out with a mask; each loader needs its own mask id (a page can show several).
  const maskId = `floppy-f-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <div className="floppy-loader relative grid h-40 w-40 place-items-center" role="status" aria-label="Loading">
      <div aria-hidden className="paper-grid absolute inset-0 rounded-full [mask-image:radial-gradient(closest-side,#000,transparent)]" />
      <span aria-hidden className="floppy-loader-ring" />
      <span aria-hidden className="floppy-loader-ring [animation-delay:1s]" />
      <span aria-hidden className="floppy-loader-ring [animation-delay:2s]" />
      <div aria-hidden className="relative flex flex-col items-center gap-3">
        <svg viewBox="-4 -4 108 128" className="floppy-loader-mark h-[60px] w-[52px]">
          <defs>
            <mask id={maskId}>
              <rect x="-4" y="-4" width="108" height="128" fill="#fff" />
              <path fill="#000" d="M23 126V66A17 17 0 0 1 40 49H80.5A1.5 1.5 0 0 1 81.6 51.5L71 64H40A10 10 0 0 0 30 74V77H58A8 8 0 0 1 58 93H40A10 10 0 0 0 30 103V126Z" />
            </mask>
          </defs>
          <g fill="var(--brand)">
            <path mask={`url(#${maskId})`} d="M25 0H61V26A13 13 0 0 0 74 39H100V82Q100 99 84 105L30 120H25A25 25 0 0 1 0 95V25A25 25 0 0 1 25 0Z" />
            <path className="floppy-loader-fold" d="M66 1V23A12 12 0 0 0 78 35H100Z" />
          </g>
        </svg>
        <span className="floppy-loader-shadow" />
      </div>
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-xl bg-surface-2", className)} />;
}

export function EmptyState({
  icon,
  title,
  children,
  action,
  className,
}: {
  icon?: ReactNode;
  title: ReactNode;
  children?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("label-card-flat paper-grid flex flex-col items-center gap-3 border-dashed px-6 py-12 text-center", className)}>
      {icon && <div className="grid h-12 w-12 place-items-center rounded-full border-2 border-rule bg-surface text-ink">{icon}</div>}
      <h3 className="font-display text-lg font-bold">{title}</h3>
      {children && <div className="max-w-md text-sm text-ink-soft">{children}</div>}
      {action && <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

/** One place that turns API errors into the right empty state: suspended, no access, not found, offline, other. */
export function ErrorState({ error, onRetry, notFound }: { error: unknown; onRetry?: () => void; notFound?: string }) {
  if (error instanceof ApiError) {
    if (error.code === "ORGANIZATION_SUSPENDED") {
      return (
        <EmptyState icon={<PauseCircle className="h-6 w-6" />} title="This organization is suspended" action={<Button asChild variant="outline"><Link href="/app/welcome">Your organizations</Link></Button>}>
          {error.message}
        </EmptyState>
      );
    }
    if (error.status === 403) {
      return (
        <EmptyState icon={<Lock className="h-6 w-6" />} title="You don't have access">
          {error.message}
        </EmptyState>
      );
    }
    if (error.status === 404) {
      return (
        <EmptyState icon={<SearchX className="h-6 w-6" />} title="Not found">
          {notFound ?? "It doesn't exist, or you don't have access to it."}
        </EmptyState>
      );
    }
  }
  if (error instanceof TypeError) {
    return (
      <EmptyState icon={<WifiOff className="h-6 w-6" />} title="Can't reach the server" action={onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>}>
        Check your connection. If you&apos;re running locally, make sure the API is running on port 4000.
      </EmptyState>
    );
  }
  return (
    <EmptyState icon={<AlertTriangle className="h-6 w-6" />} title="Couldn't load this" action={onRetry && <Button variant="outline" onClick={onRetry}>Try again</Button>}>
      {error instanceof Error ? error.message : "Something went wrong."}
    </EmptyState>
  );
}

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: ReactNode; title: ReactNode; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <div className="mb-1 font-mono text-xs font-semibold tracking-widest text-accent uppercase">{eyebrow}</div>}
        <h1 className="font-display text-3xl leading-tight font-extrabold sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
