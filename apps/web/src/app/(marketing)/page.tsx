import { ArrowRight, Bell, CalendarCheck2, Check, CircleDot, FileText, GitBranch, MessagesSquare, Sparkles, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@floppy/shared";
import { Logo } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: { absolute: "Floppy" },
  description: BRAND.pitch,
};

const steps = [
  { day: "MON", title: "Commit to one thing", body: "Each engineer writes a short plan: the one result they'll ship, why it matters, the small steps and how users will find out." },
  { day: "MON", title: "Get it approved", body: "Their lead reads it, approves it or sends it back with one comment. No status meeting, no spreadsheet archaeology." },
  { day: "TUE–THU", title: "Tick it off", body: "Tasks get checked as they land. Assigned work, deadlines and chat live next to the plan, not in five other tabs." },
  { day: "FRI", title: "Did it ship?", body: "Close the week with a yes or a no. The team's history fills itself in, week after week." },
];

const features = [
  { Icon: CalendarCheck2, title: "Plans with a backbone", body: "One main task, a why, sub-goals and go-to-market goals. Drafts are private; submitted plans go to the right lead." },
  { Icon: CircleDot, title: "Assigned work with deadlines", body: "Leads assign tasks, set deadlines and priorities. Assignees pull them into their week in one click." },
  { Icon: GitBranch, title: "GitHub issues, linked", body: "Link a team's repos, browse open issues and turn one into an assignment without leaving Floppy." },
  { Icon: MessagesSquare, title: "Chat where the work is", body: "Threads on every task and plan, a channel per team and direct messages, all in realtime." },
  { Icon: FileText, title: "Pages that remember", body: "A markdown wiki for the project. Every save is a version you can open, export or import." },
  { Icon: Bell, title: "Nudges, not noise", body: "In-app, email and SMS for what matters: approvals, assignments, deadlines. Each person picks their channels." },
];

const compare = [
  ["Write a plan in 5 minutes", true, "template + discipline", "a new tab per week"],
  ["Lead approval built in", true, "manual status field", "comments, maybe"],
  ["Know what shipped on Friday", true, "if someone updates it", "if someone updates it"],
  ["Deadlines that remind people", true, "automations to set up", "no"],
] as const;

export default function Landing() {
  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-40 border-b-2 border-rule bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4">
          <Logo />
          <nav className="hidden items-center gap-6 text-sm font-semibold md:flex" aria-label="Sections">
            <a href="#week" className="hover:text-accent">How a week works</a>
            <a href="#features" className="hover:text-accent">What&apos;s inside</a>
            <a href="#leads" className="hover:text-accent">For leads</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />
            <Button asChild variant="ghost" size="sm"><Link href="/sign-in">Sign in</Link></Button>
            <Button asChild size="sm"><Link href="/sign-up">Get started</Link></Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="paper-grid border-b-2 border-rule">
          <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-[1.1fr_1fr] md:py-24">
            <div>
              <p className="mb-4 inline-flex items-center gap-2 rounded-full border-2 border-rule bg-surface px-3 py-1 font-mono text-xs font-bold tracking-widest uppercase">
                <span className="h-2 w-2 rounded-full bg-brand" /> Weekly planning for software teams
              </p>
              <h1 className="font-display text-5xl leading-[0.95] font-extrabold tracking-tight sm:text-7xl">
                Less strain.
                <br />
                <span className="text-accent">More brain.</span>
              </h1>
              <p className="mt-6 max-w-xl text-lg text-ink-soft">{BRAND.pitch}</p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Button asChild size="lg"><Link href="/sign-up">Start planning <ArrowRight className="h-4 w-4" /></Link></Button>
                <Button asChild size="lg" variant="outline"><a href="#week">See a week</a></Button>
              </div>
            </div>
            <PlanLabel />
          </div>
        </section>

        {/* The week */}
        <section id="week" className="mx-auto max-w-6xl scroll-mt-20 px-4 py-20">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">A week, in four moves</h2>
          <p className="mt-2 max-w-2xl text-ink-soft">Small enough to fit on a floppy disk. Strict enough that Friday means something.</p>
          <ol className="mt-10 grid gap-4 md:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="label-card relative p-5">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs font-bold tracking-widest text-accent">{s.day}</span>
                  <span className="font-display text-4xl font-extrabold text-rule-soft">{i + 1}</span>
                </div>
                <h3 className="mt-3 text-lg font-bold">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="scroll-mt-20 border-y-2 border-rule bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-20">
            <h2 className="font-display text-3xl font-extrabold sm:text-4xl">Everything the week needs. Nothing it doesn&apos;t.</h2>
            <div className="mt-10 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ Icon, title, body }) => (
                <div key={title} className="flex gap-4">
                  <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border-2 border-rule bg-accent-soft"><Icon className="h-5 w-5" /></div>
                  <div>
                    <h3 className="font-bold">{title}</h3>
                    <p className="mt-1 text-sm text-ink-soft">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AI */}
        <section className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-20 md:grid-cols-2">
          <div>
            <p className="font-mono text-xs font-bold tracking-widest text-accent uppercase">Optional · AI plan review</p>
            <h2 className="mt-2 font-display text-3xl font-extrabold sm:text-4xl">A tough first reader before the real one</h2>
            <p className="mt-3 text-ink-soft">
              When your workspace switches it on, an AI reviewer reads a draft the way a demanding lead would: is each task a checkable result, does the main task say why, will users ever hear about it, does it fit in a week? Every finding sits next to its task with a rewrite you can apply in one click. Planning works the same without it.
            </p>
          </div>
          <div className="label-card space-y-3 p-5" aria-label="Example review">
            <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-widest uppercase"><Sparkles className="h-4 w-4 text-accent" /> Review · adjust</div>
            {[
              ["Not checkable", "“Work on billing exports” is activity, not a result.", "Enterprise accounts download billing exports as CSV, confirmed on staging"],
              ["Carried over", "This is the third week this has slipped.", "Export of the [largest] account completes under 30s, confirmed on staging"],
            ].map(([issue, problem, fix]) => (
              <div key={issue} className="rounded-xl border-2 border-rule-soft p-3">
                <span className="rounded-md bg-warn-soft px-1.5 py-0.5 font-mono text-[11px] font-bold text-warn uppercase">{issue}</span>
                <p className="mt-2 text-sm">{problem}</p>
                <p className="mt-2 rounded-lg bg-accent-soft p-2 text-sm"><Check className="mr-1 inline h-3.5 w-3.5" />{fix}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Leads */}
        <section id="leads" className="scroll-mt-20 border-y-2 border-rule bg-ink text-paper">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 md:grid-cols-[1fr_1.2fr] md:items-center">
            <div>
              <Users className="h-8 w-8 text-accent" />
              <h2 className="mt-3 font-display text-3xl font-extrabold sm:text-4xl">For leads: the whole week on one screen</h2>
              <ul className="mt-5 space-y-2 text-paper/80">
                {["Who has submitted, who's still drafting", "Approve or send back with one comment", "Progress bars as tasks get ticked", "Which main tasks actually shipped, week by week"].map((t) => (
                  <li key={t} className="flex gap-2"><Check className="mt-1 h-4 w-4 shrink-0 text-accent" />{t}</li>
                ))}
              </ul>
            </div>
            <div className="rounded-[14px] border-2 border-paper/30 bg-paper/5 p-4">
              {[
                ["Marco R.", "Partial refunds live for EU merchants", "approved", 60],
                ["Dev K.", "Welcome email A/B test live", "waiting", 0],
                ["Tom B.", "Still drafting", "draft", 0],
                ["Leila H.", "Chargeback alerts within 5 minutes", "shipped", 100],
              ].map(([who, what, status, pct]) => (
                <div key={who as string} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 border-b border-paper/10 py-3 text-sm last:border-0">
                  <span className="font-semibold">{who}</span>
                  <span className="truncate text-paper/70">{what}</span>
                  <span className="font-mono text-[11px] uppercase text-accent">{status}</span>
                  <div className="col-span-3 h-1.5 overflow-hidden rounded-full bg-paper/10"><div className="h-full bg-accent" style={{ width: `${pct}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Compare */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="font-display text-3xl font-extrabold sm:text-4xl">Narrower than your project tool. On purpose.</h2>
          <p className="mt-2 max-w-2xl text-ink-soft">Keep Notion for docs and Linear for issues. Floppy does one job: make this week&apos;s commitment explicit, approved and checked.</p>
          <div className="label-card-flat mt-8 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b-2 border-rule bg-surface-2 text-left font-mono text-[11px] tracking-wider uppercase">
                  <th className="px-4 py-3"> </th>
                  <th className="px-4 py-3 text-accent">Floppy</th>
                  <th className="px-4 py-3">Docs tool</th>
                  <th className="px-4 py-3">Spreadsheet</th>
                </tr>
              </thead>
              <tbody>
                {compare.map(([what, , docs, sheet]) => (
                  <tr key={what} className="border-b border-rule-soft last:border-0">
                    <td className="px-4 py-3 font-semibold">{what}</td>
                    <td className="px-4 py-3"><Check className="h-5 w-5 text-accent" aria-label="Yes" /></td>
                    <td className="px-4 py-3 text-ink-soft">{docs}</td>
                    <td className="px-4 py-3 text-ink-soft">{sheet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="px-4 pb-20">
          <div className="label-card mx-auto flex max-w-4xl flex-col items-center gap-4 bg-accent-soft px-6 py-12 text-center">
            <h2 className="font-display text-3xl font-extrabold sm:text-4xl">Plan this week before lunch.</h2>
            <p className="text-ink-soft">Free while you try it. Bring your team with an invite.</p>
            <Button asChild size="lg"><Link href="/sign-up">Get started <ArrowRight className="h-4 w-4" /></Link></Button>
          </div>
        </section>
      </main>

      <footer className="border-t-2 border-rule">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm sm:flex-row">
          <div className="flex items-center gap-3"><Logo /><span className="text-muted">{BRAND.tagline}</span></div>
          <div className="flex items-center gap-4">
            <ThemeToggle />
            <Link href="/sign-in" className="font-semibold hover:text-accent">Sign in</Link>
            <span className="text-muted">© {new Date().getFullYear()} Floppy</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** The hero illustration: a plan drawn as a floppy-disk label. */
function PlanLabel() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-label="Example weekly plan">
      <div className="absolute inset-0 translate-x-3 translate-y-3 rotate-2 rounded-[18px] border-2 border-rule bg-accent" aria-hidden />
      <div className="label-card relative -rotate-1 p-0">
        <div className="flex items-center justify-between border-b-2 border-rule px-5 py-3">
          <span className="font-mono text-xs font-bold tracking-widest uppercase">Week of Oct 12</span>
          <span className="rounded-md bg-ok-soft px-2 py-0.5 font-mono text-[11px] font-bold text-ok uppercase">Approved</span>
        </div>
        <div className="space-y-4 px-5 py-4">
          <div>
            <div className="font-mono text-[11px] font-bold tracking-widest text-accent uppercase">Main · ship this</div>
            <p className="mt-1 font-display text-xl leading-snug font-bold">Partial refunds live for all EU merchants, confirmed in production</p>
            <p className="mt-1 text-sm text-ink-soft">Why: top support request in September.</p>
          </div>
          <ul className="space-y-2 text-sm">
            {[
              [true, "Refund amounts match the ledger"],
              [true, "Webhook retries capped at 5"],
              [false, "Help-centre article published"],
            ].map(([done, t]) => (
              <li key={t as string} className="flex items-center gap-2">
                <span className={`grid h-5 w-5 place-items-center rounded-md border-2 border-rule ${done ? "bg-accent text-accent-ink" : "bg-surface"}`}>{done && <Check className="h-3 w-3" />}</span>
                <span className={done ? "text-muted line-through" : ""}>{t}</span>
              </li>
            ))}
          </ul>
          <div className="flex items-center justify-between border-t-2 border-dashed border-rule-soft pt-3 font-mono text-xs text-muted">
            <span>2 / 3 done</span>
            <span>est. 22h</span>
          </div>
        </div>
      </div>
    </div>
  );
}
