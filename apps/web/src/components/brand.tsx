import Link from "next/link";
import { cn } from "@/lib/utils";

/** Floppy's mark (the owner's SVG in /public) plus the wordmark set in the display font. */
export function Logo({ href = "/", className, compact }: { href?: string; className?: string; compact?: boolean }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 font-display text-xl font-bold tracking-tight", className)} aria-label="Floppy home">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/floppy-mark.svg" alt="" width={26} height={30} className="h-[30px] w-[26px]" />
      {!compact && <span>Floppy</span>}
    </Link>
  );
}
