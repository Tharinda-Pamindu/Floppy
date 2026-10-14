import { Slot } from "radix-ui";
import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const variants = {
  primary:
    "bg-accent text-accent-ink border-2 border-rule shadow-[var(--shadow-label-sm)] hover:-translate-y-px hover:shadow-[var(--shadow-label)] active:translate-y-0 active:shadow-none",
  ink: "bg-ink text-paper border-2 border-rule shadow-[var(--shadow-label-sm)] hover:-translate-y-px active:translate-y-0 active:shadow-none",
  outline: "bg-surface text-ink border-2 border-rule hover:bg-surface-2",
  ghost: "bg-transparent text-ink border-2 border-transparent hover:bg-surface-2",
  danger: "bg-danger text-white border-2 border-rule shadow-[var(--shadow-label-sm)] hover:-translate-y-px active:translate-y-0 active:shadow-none",
  soft: "bg-accent-soft text-ink border-2 border-transparent hover:border-rule",
} as const;

const sizes = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
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
        "inline-flex items-center justify-center rounded-full font-semibold whitespace-nowrap transition-all duration-150 select-none",
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
