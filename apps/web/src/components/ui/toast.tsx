"use client";

import { CheckCircle2, CircleAlert, X } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Toast = { id: number; tone: "ok" | "error"; message: string };
const ToastContext = createContext<{ ok: (m: string) => void; error: (m: string) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((tone: Toast["tone"], message: string) => {
    const id = Date.now() + Math.random();
    setToasts((t) => [...t.slice(-3), { id, tone, message }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), tone === "error" ? 7000 : 4000);
  }, []);
  const api = useMemo(() => ({ ok: (m: string) => push("ok", m), error: (m: string) => push("error", m) }), [push]);
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed inset-x-3 bottom-20 z-[60] flex flex-col items-center gap-2 sm:right-4 sm:bottom-4 sm:left-auto sm:items-end">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className={cn(
              "label-card pointer-events-auto flex w-full max-w-sm items-start gap-2 px-3 py-2.5 text-sm font-medium",
              t.tone === "error" ? "border-danger" : "",
            )}
          >
            {t.tone === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-danger" />}
            <span className="flex-1">{t.message}</span>
            <button className="text-muted hover:text-ink" aria-label="Dismiss" onClick={() => setToasts((all) => all.filter((x) => x.id !== t.id))}>
              <X className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}
