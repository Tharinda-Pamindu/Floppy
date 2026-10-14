import { cn } from "@/lib/utils";

/** Original decorative shapes for the marketing pages. Purely visual: hidden from assistive tech. */
const shapes = {
  squiggle: { viewBox: "0 0 40 20", d: "M2 10C6 2 10 2 14 10s8 8 12 0 8-8 12 0" },
  triangle: { viewBox: "0 0 36 30", d: "M4 26 18 4l14 22Z" },
  arc: { viewBox: "0 0 36 28", d: "M4 4q12 20 28 6" },
  dash: { viewBox: "0 0 24 18", d: "M3 3l18 12" },
  ring: { viewBox: "0 0 28 28", d: "M14 3a11 11 0 1 1 0 22 11 11 0 0 1 0-22Z" },
} as const;

type Piece = { shape: keyof typeof shapes; className: string; size: number; rotate?: number; delay?: number };

/** Scattered strokes in rose, sun, mint and lavender that bob gently (paused for "reduce motion"). */
export function Confetti({ pieces, className }: { pieces: Piece[]; className?: string }) {
  return (
    <div aria-hidden className={cn("pointer-events-none absolute inset-0", className)}>
      {pieces.map((p, i) => {
        const s = shapes[p.shape];
        return (
          <svg
            key={i}
            viewBox={s.viewBox}
            width={p.size}
            className={cn("floppy-drift absolute fill-none stroke-current", p.className)}
            style={{ rotate: `${p.rotate ?? 0}deg`, animationDelay: `${p.delay ?? 0}s` }}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={s.d} />
          </svg>
        );
      })}
    </div>
  );
}

/** A big soft circle behind a section (the lavender wash). */
export function Blob({ className }: { className?: string }) {
  return <div aria-hidden className={cn("pointer-events-none absolute rounded-full bg-blob", className)} />;
}

export const heroConfetti: Piece[] = [
  { shape: "triangle", className: "left-[7%] top-[52%] text-rose", size: 30, rotate: -18 },
  { shape: "arc", className: "left-[11%] top-[70%] text-rose", size: 34, rotate: 10, delay: 1.2 },
  { shape: "dash", className: "left-[24%] top-[40%] text-sun", size: 18, rotate: -30, delay: 2.4 },
  { shape: "squiggle", className: "left-[16%] top-[84%] hidden text-highlight/50 sm:block", size: 34, delay: 3.1 },
  { shape: "triangle", className: "right-[8%] top-[48%] text-rose", size: 30, rotate: 160, delay: 0.6 },
  { shape: "ring", className: "right-[14%] top-[66%] text-rose/60", size: 30, delay: 1.8 },
  { shape: "squiggle", className: "right-[10%] top-[80%] text-sun", size: 38, delay: 2.9 },
  { shape: "dash", className: "right-[26%] top-[36%] hidden text-mint sm:block", size: 18, rotate: 30, delay: 4 },
];

export const sectionConfetti: Piece[] = [
  { shape: "arc", className: "left-[38%] top-[14%] text-sun", size: 30, rotate: -10 },
  { shape: "dash", className: "right-[30%] top-[8%] text-highlight/50", size: 18, rotate: 20, delay: 1.5 },
  { shape: "squiggle", className: "left-[44%] top-[34%] hidden text-rose sm:block", size: 34, delay: 2.5 },
  { shape: "ring", className: "right-[12%] top-[20%] hidden text-mint sm:block", size: 26, delay: 3.4 },
];
