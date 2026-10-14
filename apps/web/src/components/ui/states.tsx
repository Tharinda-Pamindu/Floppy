"use client";

import { AlertTriangle, Lock, PauseCircle, SearchX, WifiOff } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useLoadingOverlay } from "@/components/loading-overlay";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Button } from "./button";

export function Spinner({ className }: { className?: string }) {
  return <span className={cn("inline-block h-5 w-5 animate-spin rounded-full border-[3px] border-accent border-t-transparent", className)} aria-label="Loading" role="status" />;
}

/**
 * A page or tab still loading its data. It keeps the space with a small
 * spinner, and the full-screen logo overlay (LoadingOverlayProvider) comes
 * forward if the wait lasts more than a moment.
 */
export function PageLoader({ label = "Loading…" }: { label?: string }) {
  useLoadingOverlay(label);
  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-sm text-muted">
      <Spinner className="h-8 w-8" />
      <span>{label}</span>
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
      {icon && <div className="grid h-12 w-12 place-items-center rounded-full border border-rule bg-surface text-ink">{icon}</div>}
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
        {eyebrow && <div className="mb-1 text-xs font-semibold tracking-wider text-accent uppercase">{eyebrow}</div>}
        <h1 className="font-display text-3xl leading-tight font-bold sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-ink-soft">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
