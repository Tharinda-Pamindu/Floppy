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
          colorPrimary: isDark ? "#2dd4bf" : "#0f766e",
          colorBackground: isDark ? "#151a21" : "#fffdf8",
          colorForeground: isDark ? "#ede8dd" : "#1c1917",
          colorPrimaryForeground: isDark ? "#062b27" : "#ffffff",
          borderRadius: "12px",
          fontFamily: "var(--font-instrument)",
        },
        elements: {
          cardBox: "border-2 border-[var(--rule)] shadow-[4px_4px_0_0_var(--shadow-ink)] rounded-[14px]",
          formButtonPrimary: "rounded-full font-semibold",
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
