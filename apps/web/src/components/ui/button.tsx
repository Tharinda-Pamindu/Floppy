import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary: "bg-accent text-accent-ink shadow-[var(--shadow-card-sm)] hover:bg-accent-hover",
  highlight: "bg-highlight text-white shadow-[var(--shadow-card-sm)] hover:bg-highlight/90 dark:text-paper",
  ink: "bg-ink text-paper shadow-[var(--shadow-card-sm)] hover:bg-ink/85",
  outline: "bg-surface text-ink border-rule-strong shadow-[var(--shadow-card-sm)] hover:bg-surface-2",
  ghost: "bg-transparent text-ink-soft hover:bg-surface-2 hover:text-ink",
  danger: "bg-danger text-white shadow-[var(--shadow-card-sm)] hover:bg-danger/90",
  soft: "bg-accent-soft text-accent hover:bg-accent-soft/70",
} as const;

const sizes = {
  sm: "h-8 px-4 text-[11px] gap-1.5",
  md: "h-10 px-5 text-xs gap-2",
  lg: "h-12 px-7 text-[13px] gap-2",
  icon: "h-10 w-10 p-0",
  "icon-sm": "h-8 w-8 p-0",
} as const;

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", asChild, loading, disabled, children, ...props },
  ref,
) {
  const Comp = asChild ? Slot.Root : "button";
  return (
    <Comp
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center rounded-full border border-transparent font-bold tracking-[0.08em] whitespace-nowrap uppercase transition-colors duration-150 select-none",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />}
          {children}
        </>
      )}
    </Comp>
  );
});
