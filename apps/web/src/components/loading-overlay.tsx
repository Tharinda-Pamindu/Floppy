"use client";

import { usePathname } from "next/navigation";
import { createContext, type ReactNode, useCallback, useContext, useEffect, useId, useRef, useState } from "react";
import { LogoLoader } from "./ui/logo-loader";

/**
 * One full-screen loading overlay for the whole app: the animated Floppy mark
 * in front of everything except toasts. It covers
 * - moving to another page (an internal link was clicked, until the new path renders), and
 * - any PageLoader on screen (a page or tab still fetching its data).
 * Quick loads never show it (SHOW_AFTER_MS); once shown it stays MIN_VISIBLE_MS
 * so it doesn't flicker.
 */
const SHOW_AFTER_MS = 200;
const MIN_VISIBLE_MS = 450;
const FADE_MS = 200;
/** If a navigation never lands (cancelled, or ends on the same path), give up. */
const NAV_GIVE_UP_MS = 10_000;

type Register = (id: string, label: string) => () => void;
const LoadingContext = createContext<Register>(() => () => {});

/** Shows the overlay (with this label) for as long as the calling component is mounted. */
export function useLoadingOverlay(label: string) {
  const register = useContext(LoadingContext);
  const id = useId();
  useEffect(() => register(id, label), [register, id, label]);
}

export function LoadingOverlayProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [loaders, setLoaders] = useState<Map<string, string>>(() => new Map());
  const [navigating, setNavigating] = useState(false);

  const register = useCallback<Register>((id, label) => {
    setLoaders((m) => new Map(m).set(id, label));
    return () =>
      setLoaders((m) => {
        const next = new Map(m);
        next.delete(id);
        return next;
      });
  }, []);

  // Start on a plain left-click of an internal link to another path. Capture
  // phase, because Next's <Link> cancels the click before it bubbles here.
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[href]");
      if (!(link instanceof HTMLAnchorElement) || link.hasAttribute("download")) return;
      if (link.target && link.target !== "_self") return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.pathname === window.location.pathname) return;
      setNavigating(true);
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  // The new path has rendered: the navigation part is over.
  useEffect(() => setNavigating(false), [pathname]);

  useEffect(() => {
    if (!navigating) return;
    const timer = setTimeout(() => setNavigating(false), NAV_GIVE_UP_MS);
    return () => clearTimeout(timer);
  }, [navigating]);

  const busy = navigating || loaders.size > 0;
  const visible = useSettledFlag(busy);
  const [rendered, setRendered] = useState(false);
  useEffect(() => {
    if (visible) {
      setRendered(true);
      return;
    }
    const timer = setTimeout(() => setRendered(false), FADE_MS);
    return () => clearTimeout(timer);
  }, [visible]);

  const label = Array.from(loaders.values()).at(-1) ?? "Loading…";
  return (
    <LoadingContext.Provider value={register}>
      {children}
      <div
        role="status"
        aria-live="polite"
        aria-hidden={!visible}
        className={`fixed inset-0 z-[55] flex flex-col items-center justify-center gap-3 bg-paper/85 text-sm text-muted backdrop-blur-sm transition-opacity duration-200 ${
          visible ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      >
        {rendered && (
          <>
            <LogoLoader />
            <span className="font-semibold">{label}</span>
          </>
        )}
      </div>
    </LoadingContext.Provider>
  );
}

/** `on`, but only after it has stayed on for SHOW_AFTER_MS, and kept for at least MIN_VISIBLE_MS once shown. */
function useSettledFlag(on: boolean) {
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  useEffect(() => {
    if (on) {
      if (visible) return;
      const timer = setTimeout(() => {
        shownAt.current = Date.now();
        setVisible(true);
      }, SHOW_AFTER_MS);
      return () => clearTimeout(timer);
    }
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), Math.max(0, MIN_VISIBLE_MS - (Date.now() - shownAt.current)));
    return () => clearTimeout(timer);
  }, [on, visible]);
  return visible;
}
