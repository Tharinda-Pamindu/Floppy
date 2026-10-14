"use client";

import { ReactLenis } from "lenis/react";
import type { ReactNode } from "react";
import "lenis/dist/lenis.css";

/**
 * Smooth wheel scrolling for the whole page (Lenis). Touch keeps the device's
 * native scrolling, and "reduce motion" turns the smoothing off (Lenis default).
 *
 * - Inner scroll areas (chat, dialogs, menus, Clerk popovers) scroll natively:
 *   `allowNestedScroll` hands them the wheel while they can still move.
 * - While a dialog, select or menu locks the page (Radix sets
 *   `data-scroll-locked`, Clerk sets `overflow: hidden` on <body>), Lenis steps
 *   aside so the page behind stays put.
 * - Section links (#week…) glide too and honour `scroll-mt-*`.
 */
const options = {
  autoRaf: true,
  lerp: 0.12,
  anchors: true,
  allowNestedScroll: true,
  stopInertiaOnNavigate: true,
  prevent: (node: HTMLElement) =>
    node === document.body && (node.hasAttribute("data-scroll-locked") || node.style.overflow === "hidden"),
};

export function SmoothScroll({ children }: { children: ReactNode }) {
  return (
    <ReactLenis root options={options}>
      {children}
    </ReactLenis>
  );
}
