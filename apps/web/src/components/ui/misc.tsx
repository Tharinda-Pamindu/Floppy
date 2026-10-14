"use client";

import { DropdownMenu, Switch as RSwitch, Tabs as RTabs } from "radix-ui";
import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn, initials } from "@/lib/utils";

export function Avatar({ person, size = 32, className }: { person: { firstName: string; lastName: string; email?: string; imageUrl?: string | null } | null; size?: number; className?: string }) {
  return (
    <span
      className={cn("inline-grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-rule bg-accent-soft font-mono text-[11px] font-bold text-ink", className)}
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
      className="relative h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-rule bg-surface-2 transition-colors data-[state=checked]:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
    >
      <RSwitch.Thumb className="block h-4 w-4 translate-x-0.5 rounded-full border-2 border-rule bg-surface transition-transform data-[state=checked]:translate-x-[22px]" />
    </RSwitch.Root>
  );
}

export const Tabs = RTabs.Root;
export function TabsList({ className, ...props }: ComponentProps<typeof RTabs.List>) {
  return <RTabs.List className={cn("mb-5 flex gap-1 overflow-x-auto border-b-2 border-rule-soft", className)} {...props} />;
}
export function TabsTrigger({ className, ...props }: ComponentProps<typeof RTabs.Trigger>) {
  return (
    <RTabs.Trigger
      className={cn(
        "-mb-[2px] shrink-0 border-b-[3px] border-transparent px-3 py-2 text-sm font-semibold text-muted transition-colors hover:text-ink data-[state=active]:border-accent data-[state=active]:text-ink",
        className,
      )}
      {...props}
    />
  );
}
export const TabsContent = RTabs.Content;

export function Menu({ trigger, children, align = "end" }: { trigger: ReactNode; children: ReactNode; align?: "start" | "end" }) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>{trigger}</DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align={align} sideOffset={6} className="label-card z-50 min-w-48 p-1.5">
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

export const MenuSeparator = () => <DropdownMenu.Separator className="my-1 h-0.5 bg-rule-soft" />;

export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: "accent" | "warn" | "danger" }) {
  return (
    <div className="label-card-flat px-4 py-3">
      <div className="font-mono text-[11px] font-semibold tracking-widest text-muted uppercase">{label}</div>
      <div className={cn("mt-1 font-display text-3xl font-extrabold", tone === "accent" && "text-accent", tone === "warn" && "text-warn", tone === "danger" && "text-danger")}>{value}</div>
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
  return <th className={cn("border-b-2 border-rule bg-surface-2 px-3 py-2.5 text-left font-mono text-[11px] font-semibold tracking-wider text-ink-soft uppercase", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: ReactNode; className?: string }) {
  return <td className={cn("border-b border-rule-soft px-3 py-2.5 align-middle", className)}>{children}</td>;
}
