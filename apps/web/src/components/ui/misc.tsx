"use client";

import { DropdownMenu, Switch as RSwitch, Tabs as RTabs } from "radix-ui";
import Link from "next/link";
import { type ComponentProps, type ReactNode, useRef } from "react";
import { cn, initials } from "@/lib/utils";
import { SlidingUnderline } from "./sliding-underline";

export function Avatar({ person, size = 32, className }: { person: { firstName: string; lastName: string; email?: string; imageUrl?: string | null } | null; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-rule bg-accent-soft text-[11px] font-semibold text-accent", className)}
      style={{ width: size, height: size }}
      aria-hidden
    >
      {person?.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={person.imageUrl} alt="" width={size} height={size} className="h-full w-full object-cover" />
      ) : (
        initials(person)
      )}
    </span>
  );
}

export function Switch({ checked, onCheckedChange, disabled, label, id }: { checked: boolean; onCheckedChange: (v: boolean) => void; disabled?: boolean; label: string; id?: string }) {
  return (
    <RSwitch.Root
      id={id}
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className="relative h-5 w-9 shrink-0 cursor-pointer rounded-full bg-rule-strong transition-colors data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full bg-white shadow-[var(--shadow-card)] transition-transform data-[state=checked]:translate-x-[18px]" />
    </RSwitch.Root>
  );
}

export const Tabs = RTabs.Root;
export function TabsList({ className, children, ...props }: ComponentProps<typeof RTabs.List>) {
  const ref = useRef<HTMLDivElement>(null);
  // The rule is an inset shadow, not a border, so the active underline paints over it without overflowing (which showed a scrollbar).
  return (
    <RTabs.List ref={ref} className={cn("scrollbar-none relative mb-5 flex gap-1 overflow-x-auto shadow-[inset_0_-1px_0_var(--rule)]", className)} {...props}>
      {children}
      <SlidingUnderline container={ref} selector='[role="tab"][data-state="active"]' />
    </RTabs.List>
  );
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof RTabs.Trigger>) {
  // The transparent border keeps the height; the visible underline is TabsList's SlidingUnderline.
  return (
    <RTabs.Trigger
      className={cn(
        "shrink-0 border-b-2 border-transparent px-3 py-2 text-[13px] font-semibold text-muted transition-colors hover:text-ink data-[state=active]:text-ink",
        className,
      )}
      {...props}
    />
  );
}
/** A tab's panel; it fades and rises in each time its tab becomes active. */
export function TabsContent({ className, ...props }: ComponentProps<typeof RTabs.Content>) {
  return <RTabs.Content className={cn("data-[state=active]:animate-[floppy-tab-in_0.28s_ease-out]", className)} {...props} />;
}

export function Menu({ trigger, children, align = "end" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} className="label-card z-50 min-w-48 p-1 shadow-[var(--shadow-pop)]">
          {children}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

export function MenuItem({ children, onSelect, href, danger, disabled }: { children: ReactNode; onSelect?: () => void; href?: string; danger?: boolean; disabled?: boolean }) {
  const cls = cn(
    "flex w-full cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm font-medium outline-none data-[highlighted]:bg-surface-2 data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
    danger && "text-danger",
  );
  if (href) {
    return (
      <DropdownMenu.Item asChild disabled={disabled} className={cls}>
        <Link href={href}>{children}</Link>
      </DropdownMenu.Item>
    );
  }
  return (
    <DropdownMenu.Item className={cls} onSelect={onSelect} disabled={disabled}>
      {children}
    </DropdownMenu.Item>
  );
}

export const MenuSeparator = () => <DropdownMenu.Separator className="my-1 h-px bg-rule" />;

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "accent" | "warn" | "danger" }) {
  return (
    <div className="label-card-flat px-4 py-3">
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className={cn("mt-1 font-display text-2xl font-semibold tracking-tight", tone === "accent" && "text-accent", tone === "warn" && "text-warn", tone === "danger" && "text-danger")}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-ink-soft">{hint}</div>}
    </div>
  );
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("label-card-flat overflow-x-auto", className)}>
      <table className="w-full min-w-[560px] border-collapse text-sm">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("border-b border-rule bg-surface-2 px-3 py-2.5 text-left text-xs font-medium text-muted", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("border-b border-rule-soft px-3 py-2.5 align-middle", className)}>{children}</td>;
}
