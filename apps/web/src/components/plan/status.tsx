import type { PlanStatus } from "@floppy/shared";
import { Badge } from "@/components/ui/badge";

const labels: Record<PlanStatus, [string, "neutral" | "warn" | "accent" | "ok" | "ink"]> = {
  draft: ["Draft", "neutral"],
  submitted: ["Waiting for approval", "warn"],
  approved: ["Approved", "accent"],
  done: ["Week closed", "ink"],
};

export function PlanStatusBadge({ status }: { status: PlanStatus | null }) {
  if (!status) return <Badge>Not started</Badge>;
  const [label, tone] = labels[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function ShippedBadge({ shipped }: { shipped: boolean | null }) {
  if (shipped === null) return null;
  return shipped ? <Badge tone="ok">Shipped</Badge> : <Badge tone="danger">Didn&apos;t ship</Badge>;
}

export const ISSUE_LABELS: Record<string, string> = {
  not_checkable: "Not checkable",
  missing_why: "Missing why",
  missing_gtm: "No go-to-market",
  scope_too_big: "Too big for a week",
  carried_over: "Carried over",
  unclear: "Unclear",
};

export const KIND_LABELS = { main: "Main task", sub_goal: "Sub-goals", gtm: "Go-to-market" } as const;
