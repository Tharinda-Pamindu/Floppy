import { ArrowRight, Bell, CalendarCheck2, Check, CircleDot, FileText, GitBranch, MessagesSquare, Sparkles, Users } from "lucide-react";
import { existsSync } from "node:fs";
import path from "node:path";
import type { Metadata } from "next";
import Link from "next/link";
import { BRAND } from "@floppy/shared";
import { Logo } from "@/components/brand";
import { Blob, Confetti, heroConfetti, sectionConfetti } from "@/components/marketing/decor";
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
/** Icon tiles cycle through the palette's soft tints. */
const tileTones = ["bg-accent-soft text-accent", "bg-mint-soft text-ok", "bg-sun-soft text-warn"];

const pains = [
  "Nobody can say what actually shipped this week",
  "Monday's status meeting eats the morning",
  "Plans live in five different tabs",
  "The same task quietly slips, week after week",
  "Leads find out on Friday afternoon",
];

/**
 * Original Floppy vector illustrations live in /public/illustrations. Each
 * one is optional: until its file is there, the section shows its card instead.
 */
function illustration(name: string) {
  const file = [`${name}.svg`, `${name}.png`].find((f) => existsSync(path.join(process.cwd(), "public", "illustrations", f)));
  return file ? `/illustrations/${file}` : null;
}

const compare = [
  ["Write a plan in 5 minutes", true, "template + discipline", "a new tab per week"],
  ["Lead approval built in", true, "manual status field", "comments, maybe"],
  ["Know what shipped on Friday", true, "if someone updates it", "if someone updates it"],
  ["Deadlines that remind people", true, "automations to set up", "no"],
] as const;

export default function Landing() {
  const teamArt = illustration("team");
  const leadArt = illustration("stressed-lead");
  const boardArt = illustration("board");
  const highFiveArt = illustration("high-five");
  return (
    <div className="relative min-h-dvh overflow-x-clip">
      {/* The big lavender circle the header and hero sit on. */}
      <Blob className="top-[-38rem] left-1/2 h-[70rem] w-[70rem] -translate-x-1/2 sm:top-[-36rem]" />

      <header className="sticky top-0 z-40 bg-paper/60 backdrop-blur-md">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-3 px-4">
          <Logo />
          <nav className="hidden items-center gap-8 text-[12px] font-semibold tracking-[0.06em] uppercase md:flex" aria-label="Sections">
            <a href="#week" className="border-b-2 border-transparent py-1 hover:border-highlight">How a week works</a>
            <a href="#features" className="border-b-2 border-transparent py-1 hover:border-highlight">What&apos;s inside</a>
            <a href="#leads" className="border-b-2 border-transparent py-1 hover:border-highlight">For leads</a>
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle className="hidden sm:inline-flex" />
            <Button asChild variant="ghost" size="sm"><Link href="/sign-in">Sign in</Link></Button>
            <Button asChild variant="highlight" size="sm"><Link href="/sign-up">Get started</Link></Button>
          </div>
        </div>
      </header>

      <main>
        {/* Hero: from tablet up, exactly one screen tall (100svh minus the 5rem header): headline and call to
            action on top, the team filling the rest down to the bottom edge. On a phone (tall and narrow) the
            team would shrink to the bottom with a gap above it, so there it simply follows the text. */}
        <section className="relative flex flex-col md:min-h-[calc(100svh-5rem)]">
          <div className="relative mx-auto w-full max-w-3xl px-4 pt-8 text-center md:pt-12">
            {/* Confetti stays around the text, never on top of the people (and off phones, where it would land on the words). */}
            <Confetti pieces={heroConfetti} className="hidden -inset-x-[45%] sm:block" />
            <h1 className="font-display text-5xl leading-[1] font-bold tracking-tight sm:text-6xl lg:text-7xl">
              Less strain.
              <br />
              More brain.
            </h1>
            <p className="mx-auto mt-4 max-w-md text-sm text-muted">{BRAND.pitch}</p>
            <div className="mt-7 flex flex-wrap justify-center gap-3">
              <Button asChild size="lg"><Link href="/sign-up">Start planning <ArrowRight className="h-4 w-4" /></Link></Button>
              <Button asChild size="lg" variant="outline"><a href="#week">See a week</a></Button>
            </div>
          </div>
          {teamArt ? (
            <div className="relative mx-auto mt-8 flex w-full max-w-6xl flex-col px-4 pb-6 md:flex-1">
              {/* From tablet up the picture takes all the height left in the screen (scaled to fit, feet on the ground). */}
              <div className="relative md:min-h-[200px] md:flex-1">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={teamArt}
                  alt="A team of engineers celebrating together"
                  width={1160}
                  height={546}
                  fetchPriority="high"
                  className="h-auto w-full object-contain object-bottom md:absolute md:inset-0 md:h-full"
                />
              </div>
              {/* The ground they stand on. */}
              <div aria-hidden className="h-0.5 rounded-full bg-ink/80" />
            </div>
          ) : (
            <div className="relative mx-auto mt-16 max-w-md px-4 pb-6">
              <PlanLabel />
            </div>
          )}
        </section>

        {/* Sound familiar? Two columns with sun-yellow checks. */}
        <section className="relative">
          <SectionDivider />
          <Blob className="top-4 -left-40 h-80 w-80" />
          <Confetti pieces={sectionConfetti} />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 md:grid-cols-2">
            <div>
              <h2 className="font-display text-4xl leading-tight font-bold tracking-tight sm:text-5xl">
                You lead an engineering team and Friday keeps surprising you.
              </h2>
              <ul className="mt-8 space-y-3.5">
                {pains.map((p) => (
                  <li key={p} className="flex items-start gap-3 font-medium text-ink-soft"><CheckDot />{p}</li>
                ))}
              </ul>
            </div>
            {leadArt ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={leadArt} alt="An engineering lead with head in hands at a desk between two empty chairs" width={780} height={552} loading="lazy" className="mx-auto h-auto w-full max-w-lg" />
            ) : (
              <FridayCard />
            )}
          </div>
          <SectionDivider />
        </section>

        {/* The week */}
        <section id="week" className="mx-auto max-w-6xl scroll-mt-24 px-4 py-16">
          <div className="grid items-center gap-10 md:grid-cols-2">
            <div className="text-center md:text-left">
              <h2 className="font-display text-4xl font-bold tracking-tight">A week, in four moves</h2>
              <p className="mx-auto mt-3 max-w-xl font-medium text-ink-soft md:mx-0">Small enough to fit on a floppy disk. Strict enough that Friday means something.</p>
              {/* With the team drawing in the hero, the plan card is shown here instead. */}
              {teamArt && <div className="mx-auto mt-8 max-w-md md:mx-0"><PlanLabel /></div>}
            </div>
            {boardArt && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={boardArt} alt="A team lead pointing at a task board with To do, Doing and Done columns" width={600} height={482} loading="lazy" className="mx-auto h-auto w-full max-w-md" />
            )}
          </div>
          <ol className="mt-14 grid gap-5 text-left md:grid-cols-4">
            {steps.map((s, i) => (
              <li key={s.title} className="label-card relative p-6">
                <div className="flex items-center justify-between">
                  <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-bold tracking-wider text-accent">{s.day}</span>
                  <span className="font-display text-4xl font-bold text-highlight/25">{i + 1}</span>
                </div>
                <h3 className="mt-4 font-display text-xl font-semibold">{s.title}</h3>
                <p className="mt-2 text-sm text-ink-soft">{s.body}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* Features */}
        <section id="features" className="relative scroll-mt-24">
          <Blob className="top-24 -right-48 h-96 w-96" />
          <div className="relative mx-auto max-w-6xl px-4 py-20">
            <h2 className="mx-auto max-w-2xl text-center font-display text-4xl font-bold tracking-tight">Everything the week needs. Nothing it doesn&apos;t.</h2>
            <div className="mt-14 grid gap-x-10 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
              {features.map(({ Icon, title, body }, i) => (
                <div key={title} className="flex gap-4">
                  <div className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${tileTones[i % tileTones.length]}`}><Icon className="h-5 w-5" /></div>
                  <div>
                    <h3 className="font-display text-lg font-semibold">{title}</h3>
                    <p className="mt-1 text-sm text-ink-soft">{body}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* AI */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-20 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold tracking-wider text-highlight uppercase">Optional · AI plan review</p>
            <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">A tough first reader before the real one</h2>
            <p className="mt-4 text-ink-soft">
              When your workspace switches it on, an AI reviewer reads a draft the way a demanding lead would: is each task a checkable result, does the main task say why, will users ever hear about it, does it fit in a week? Every finding sits next to its task with a rewrite you can apply in one click. Planning works the same without it.
            </p>
          </div>
          <div className="label-card space-y-3 p-6 shadow-[var(--shadow-pop)]" aria-label="Example review">
            <div className="flex items-center gap-2 text-xs font-bold tracking-wider uppercase"><Sparkles className="h-4 w-4 text-highlight" /> Review · adjust</div>
            {[
              ["Not checkable", "“Work on billing exports” is activity, not a result.", "Enterprise accounts download billing exports as CSV, confirmed on staging"],
              ["Carried over", "This is the third week this has slipped.", "Export of the [largest] account completes under 30s, confirmed on staging"],
            ].map(([issue, problem, fix]) => (
              <div key={issue} className="rounded-xl border border-rule p-3.5">
                <span className="rounded-full bg-sun-soft px-2.5 py-0.5 text-[11px] font-bold text-warn">{issue}</span>
                <p className="mt-2 text-sm">{problem}</p>
                <p className="mt-2 rounded-xl bg-mint-soft p-2.5 text-sm"><Check className="mr-1 inline h-3.5 w-3.5 text-ok" />{fix}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Leads: a deep navy band */}
        <section id="leads" className="scroll-mt-24 px-4">
          <div className="relative mx-auto grid max-w-6xl gap-10 overflow-hidden rounded-[32px] bg-band px-6 py-16 text-white sm:px-12 md:grid-cols-[1fr_1.2fr] md:items-center">
            <Confetti pieces={[
              { shape: "squiggle", className: "right-[6%] top-[10%] text-sun", size: 36 },
              { shape: "ring", className: "left-[4%] bottom-[10%] text-mint/60", size: 30, delay: 2 },
            ]} />
            <div className="relative">
              <Users className="h-8 w-8 text-mint" />
              <h2 className="mt-3 font-display text-4xl font-bold tracking-tight">For leads: the whole week on one screen</h2>
              <ul className="mt-6 space-y-3 text-white/85">
                {["Who has submitted, who's still drafting", "Approve or send back with one comment", "Progress bars as tasks get ticked", "Which main tasks actually shipped, week by week"].map((t) => (
                  <li key={t} className="flex items-start gap-3"><CheckDot />{t}</li>
                ))}
              </ul>
            </div>
            <div className="relative rounded-2xl border border-white/15 bg-white/5 p-5">
              {[
                ["Marco R.", "Partial refunds live for EU merchants", "approved", 60],
                ["Dev K.", "Welcome email A/B test live", "waiting", 0],
                ["Tom B.", "Still drafting", "draft", 0],
                ["Leila H.", "Chargeback alerts within 5 minutes", "shipped", 100],
              ].map(([who, what, status, pct]) => (
                <div key={who as string} className="grid grid-cols-[90px_1fr_auto] items-center gap-3 border-b border-white/10 py-3 text-sm last:border-0">
                  <span className="font-semibold">{who}</span>
                  <span className="truncate text-white/70">{what}</span>
                  <span className="text-[11px] font-bold tracking-wider text-sun uppercase">{status}</span>
                  <div className="col-span-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full rounded-full bg-mint" style={{ width: `${pct}%` }} /></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Compare */}
        <section className="mx-auto max-w-6xl px-4 py-20">
          <h2 className="font-display text-4xl font-bold tracking-tight">Narrower than your project tool. On purpose.</h2>
          <p className="mt-3 max-w-2xl text-ink-soft">Keep Notion for docs and Linear for issues. Floppy does one job: make this week&apos;s commitment explicit, approved and checked.</p>
          <div className="label-card-flat mt-8 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead>
                <tr className="border-b border-rule bg-surface-2 text-left text-xs font-semibold text-muted">
                  <th className="px-5 py-3.5"> </th>
                  <th className="px-5 py-3.5 text-accent">Floppy</th>
                  <th className="px-5 py-3.5">Docs tool</th>
                  <th className="px-5 py-3.5">Spreadsheet</th>
                </tr>
              </thead>
              <tbody>
                {compare.map(([what, , docs, sheet]) => (
                  <tr key={what} className="border-b border-rule-soft last:border-0">
                    <td className="px-5 py-3.5 font-semibold">{what}</td>
                    <td className="px-5 py-3.5"><CheckDot /></td>
                    <td className="px-5 py-3.5 text-ink-soft">{docs}</td>
                    <td className="px-5 py-3.5 text-ink-soft">{sheet}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {/* Closing call to action */}
        <section className="relative overflow-hidden px-4 pb-24">
          <Blob className="-bottom-40 left-1/2 h-96 w-96 -translate-x-1/2" />
          <div className="relative mx-auto flex max-w-3xl flex-col items-center gap-4 text-center">
            {highFiveArt && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={highFiveArt} alt="Two teammates giving each other a high five" width={360} height={552} loading="lazy" className="mb-2 h-56 w-auto sm:h-64" />
            )}
            <h2 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">Plan this week before lunch.</h2>
            <p className="font-medium text-ink-soft">Free while you try it. Bring your team with an invite.</p>
            <Button asChild size="lg" className="mt-2"><Link href="/sign-up">Get started <ArrowRight className="h-4 w-4" /></Link></Button>
          </div>
        </section>
      </main>

      <footer className="relative border-t border-rule bg-paper">
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

/** A sun-yellow circle with a check: the list bullet. */
function CheckDot() {
  return (
    <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full bg-sun text-band">
      <Check className="h-3 w-3" strokeWidth={3} aria-hidden />
    </span>
  );
}

/** The dotted line that joins one section to the next. */
function SectionDivider() {
  return <div aria-hidden className="mx-auto mt-10 h-12 w-0 border-l-2 border-dotted border-rule-strong md:mt-14" />;
}

/** The hero picture: this week's plan as a card. */
function PlanLabel() {
  return (
    <div className="label-card relative p-0 text-left shadow-[var(--shadow-pop)]" aria-label="Example weekly plan">
      <div className="flex items-center justify-between border-b border-rule px-5 py-3.5">
        <span className="text-xs font-bold tracking-wider uppercase">Week of Oct 12</span>
        <span className="rounded-full bg-mint-soft px-2.5 py-0.5 text-[11px] font-bold text-ok">Approved</span>
      </div>
      <div className="space-y-4 px-5 py-5">
        <div>
          <div className="text-[11px] font-bold tracking-wider text-highlight uppercase">Main · ship this</div>
          <p className="mt-1 font-display text-xl leading-snug font-semibold">Partial refunds live for all EU merchants, confirmed in production</p>
          <p className="mt-1 text-sm text-ink-soft">Why: top support request in September.</p>
        </div>
        <ul className="space-y-2.5 text-sm">
          {[
            [true, "Refund amounts match the ledger"],
            [true, "Webhook retries capped at 5"],
            [false, "Help-centre article published"],
          ].map(([done, t]) => (
            <li key={t as string} className="flex items-center gap-2.5">
              <span className={`grid h-5 w-5 place-items-center rounded-full border ${done ? "border-transparent bg-mint text-band" : "border-rule-strong bg-surface"}`}>{done && <Check className="h-3 w-3" strokeWidth={3} />}</span>
              <span className={done ? "text-muted line-through" : ""}>{t}</span>
            </li>
          ))}
        </ul>
        <div className="flex items-center justify-between border-t border-dashed border-rule pt-3 font-mono text-xs text-muted">
          <span>2 / 3 done</span>
          <span>est. 22h</span>
        </div>
      </div>
    </div>
  );
}

/** The "problem" picture: Friday afternoon without Floppy. */
function FridayCard() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-label="Example of a Friday without Floppy">
      <div className="label-card rotate-[-2deg] p-6 shadow-[var(--shadow-pop)]">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold tracking-wider text-muted uppercase">Friday · 4:55 pm</span>
          <span className="rounded-full bg-danger-soft px-2.5 py-0.5 text-[11px] font-bold text-danger">No answers</span>
        </div>
        <ul className="mt-5 space-y-3 text-sm">
          {["Did the billing export ship?", "Who's still on the refunds work?", "Why did onboarding slip again?"].map((q) => (
            <li key={q} className="flex items-center justify-between gap-3 rounded-xl bg-surface-2 px-3.5 py-3">
              <span className="font-medium">{q}</span>
              <span className="font-display text-lg font-bold text-highlight">?</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="label-card absolute -right-3 -bottom-6 rotate-[3deg] px-4 py-3 text-sm font-semibold shadow-[var(--shadow-pop)]">
        <span className="text-mint">●</span> With Floppy: answered on Monday
      </div>
    </div>
  );
}
