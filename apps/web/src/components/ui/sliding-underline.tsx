"use client";

import { type RefObject, useLayoutEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * The underline under the active item of a tab bar or nav strip. When the
 * active item changes it glides there and takes the new item's width.
 * `container` must be `position: relative`; `selector` finds the active item
 * inside it. The first placement is instant so it doesn't fly in on load.
 */
export function SlidingUnderline({
  container,
  selector,
  className,
}: {
  container: RefObject<HTMLElement | null>;
  selector: string;
  className?: string;
}) {
  const [box, setBox] = useState<{ left: number; width: number } | null>(null);
  const [animate, setAnimate] = useState(false);

  useLayoutEffect(() => {
    const el = container.current;
    if (!el) return;
    const update = () => {
      const active = el.querySelector<HTMLElement>(selector);
      if (!active) return setBox(null);
      const next = { left: active.offsetLeft, width: active.offsetWidth };
      setBox((prev) => (prev && prev.left === next.left && prev.width === next.width ? prev : next));
    };
    update();
    const frame = requestAnimationFrame(() => setAnimate(true));
    // Active item changed (Radix sets data-state, links set aria-current), items added or resized, fonts loaded.
    const mutations = new MutationObserver(update);
    mutations.observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-state", "aria-current"] });
    const resize = new ResizeObserver(update);
    resize.observe(el);
    for (const child of Array.from(el.children)) resize.observe(child);
    void document.fonts?.ready.then(update);
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resize.disconnect();
    };
  }, [container, selector]);

  if (!box) return null;
  return (
    <span
      aria-hidden
      className={cn(
        "pointer-events-none absolute bottom-0 left-0 h-[3px] rounded-full bg-accent",
        animate && "transition-[transform,width] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        className,
      )}
      style={{ width: box.width, transform: `translateX(${box.left}px)` }}
    />
  );
}
