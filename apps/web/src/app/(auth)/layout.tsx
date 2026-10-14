import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { BRAND } from "@floppy/shared";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh md:grid-cols-[1fr_1.1fr]">
      <aside className="paper-grid relative hidden flex-col justify-between border-r-2 border-rule p-10 md:flex">
        <Logo />
        <div>
          <h2 className="font-display text-5xl leading-[0.95] font-extrabold">
            Less strain.
            <br />
            <span className="text-accent">More brain.</span>
          </h2>
          <ul className="mt-8 space-y-3 text-ink-soft">
            {["One main thing to ship each week", "Approved by your lead before you start", "Deadlines and chat next to the plan", "By Friday, you know what shipped"].map((t) => (
              <li key={t} className="flex gap-2"><Check className="mt-1 h-4 w-4 text-accent" />{t}</li>
            ))}
          </ul>
        </div>
        <p className="text-sm text-muted">{BRAND.tagline}</p>
      </aside>
      <main className="flex flex-col">
        <div className="flex items-center justify-between p-4">
          <span className="md:invisible"><Logo /></span>
          <ThemeToggle />
        </div>
        <div className="flex flex-1 items-start justify-center px-4 pb-10 sm:items-center">{children}</div>
      </main>
    </div>
  );
}
