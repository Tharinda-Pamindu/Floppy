"use client";

import { ClerkProvider } from "@clerk/nextjs";
import { dark } from "@clerk/themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider, useTheme } from "next-themes";
import { useState, type ReactNode } from "react";
import { ApiError } from "@/lib/api";
import { LoadingOverlayProvider } from "./loading-overlay";
import { SmoothScroll } from "./smooth-scroll";
import { ToastProvider } from "./ui/toast";

function ClerkWithTheme({ children }: { children: ReactNode }) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === "dark";
  return (
    <ClerkProvider
      appearance={{
        theme: isDark ? dark : undefined,
        variables: {
          colorPrimary: isDark ? "#9ba1f5" : "#2e3192",
          colorBackground: isDark ? "#15173a" : "#ffffff",
          colorForeground: isDark ? "#f2f3ff" : "#15162b",
          colorPrimaryForeground: isDark ? "#0e0f24" : "#ffffff",
          borderRadius: "12px",
          fontFamily: "var(--font-dm-sans)",
        },
        elements: {
          cardBox: "border border-[var(--rule)] shadow-[var(--shadow-pop)] rounded-xl",
          formButtonPrimary: "rounded-full font-bold uppercase tracking-[0.08em] text-xs",
        },
      }}
      signInUrl="/sign-in"
      signUpUrl="/sign-up"
      signInFallbackRedirectUrl="/app"
      signUpFallbackRedirectUrl="/app"
    >
      {children}
    </ClerkProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            // Retry network blips, never 4xx answers.
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <ClerkWithTheme>
        <QueryClientProvider client={queryClient}>
          <ToastProvider>
            <LoadingOverlayProvider>
              <SmoothScroll>{children}</SmoothScroll>
            </LoadingOverlayProvider>
          </ToastProvider>
        </QueryClientProvider>
      </ClerkWithTheme>
    </ThemeProvider>
  );
}
