import Link from "next/link";
import { Logo } from "@/components/brand";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="paper-grid grid min-h-dvh place-items-center px-4">
      <div className="label-card max-w-md p-8 text-center">
        <div className="flex justify-center"><Logo /></div>
        <p className="mt-6 font-mono text-sm font-bold tracking-widest text-accent">404</p>
        <h1 className="mt-1 font-display text-3xl font-extrabold">Nothing on this disk</h1>
        <p className="mt-2 text-ink-soft">The page doesn&apos;t exist, or you don&apos;t have access to it.</p>
        <Button asChild className="mt-6"><Link href="/app">Back to Floppy</Link></Button>
      </div>
    </main>
  );
}
