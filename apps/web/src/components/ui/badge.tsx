import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const tones = {
  neutral: "bg-surface-2 text-ink-soft border-rule-soft",
  accent: "bg-accent-soft text-ink border-accent",
  ok: "bg-ok-soft text-ok border-ok",
  warn: "bg-warn-soft text-warn border-warn",
  danger: "bg-danger-soft text-danger border-danger",
  ink: "bg-ink text-paper border-ink",
} as const;

export type BadgeTone = keyof typeof tones;

export function Badge({ tone = "neutral", className, ...props }: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-semibold tracking-wide uppercase",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
