"use client";

import { useId } from "react";

/** The Floppy mark bobbing over soft brand-coloured ripples and a faded paper grid (styles in globals.css). */
export function LogoLoader() {
  // The F is cut out with a mask; each loader needs its own mask id.
  const maskId = `floppy-f-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <div className="floppy-loader relative grid h-40 w-40 place-items-center" aria-hidden>
      <div className="paper-grid absolute inset-0 rounded-full [mask-image:radial-gradient(closest-side,#000,transparent)]" />
      <span className="floppy-loader-ring" />
      <span className="floppy-loader-ring [animation-delay:1s]" />
      <span className="floppy-loader-ring [animation-delay:2s]" />
      <div className="relative flex flex-col items-center gap-3">
        <svg viewBox="-4 -4 108 128" className="floppy-loader-mark h-[60px] w-[52px]">
          <defs>
            <mask id={maskId}>
              <rect x="-4" y="-4" width="108" height="128" fill="#fff" />
              <path fill="#000" d="M23 126V66A17 17 0 0 1 40 49H80.5A1.5 1.5 0 0 1 81.6 51.5L71 64H40A10 10 0 0 0 30 74V77H58A8 8 0 0 1 58 93H40A10 10 0 0 0 30 103V126Z" />
            </mask>
          </defs>
          <g fill="var(--brand)">
            <path mask={`url(#${maskId})`} d="M25 0H61V26A13 13 0 0 0 74 39H100V82Q100 99 84 105L30 120H25A25 25 0 0 1 0 95V25A25 25 0 0 1 25 0Z" />
            <path className="floppy-loader-fold" d="M66 1V23A12 12 0 0 0 78 35H100Z" />
          </g>
        </svg>
        <span className="floppy-loader-shadow" />
      </div>
    </div>
  );
}
