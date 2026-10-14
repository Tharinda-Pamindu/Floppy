"use client";

import { SignIn, SignUp, useAuth } from "@clerk/nextjs";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import { PageLoader } from "@/components/ui/states";

/**
 * Where Clerk's invitation emails land. Clerk adds `__clerk_ticket` and
 * `__clerk_status` to the URL: new people sign up, existing people sign in,
 * and the ticket adds them to the organization. /app then syncs memberships.
 */
function AcceptInvite() {
  const params = useSearchParams();
  const { isSignedIn, isLoaded } = useAuth();
  const router = useRouter();
  const status = params.get("__clerk_status");
  const hasTicket = !!params.get("__clerk_ticket");

  useEffect(() => {
    if (isLoaded && (status === "complete" || (!hasTicket && isSignedIn))) router.replace("/app");
  }, [isLoaded, isSignedIn, status, hasTicket, router]);

  if (!isLoaded || status === "complete") return <PageLoader label="Joining the organization…" />;
  if (!hasTicket) {
    return (
      <div className="label-card max-w-md p-6 text-center">
        <h1 className="font-display text-xl font-bold">This invite link is incomplete</h1>
        <p className="mt-2 text-sm text-ink-soft">Open the link straight from the invitation email, or ask for a new invite.</p>
      </div>
    );
  }
  return status === "sign_in" ? (
    <SignIn path="/accept-invite" routing="path" forceRedirectUrl="/app" />
  ) : (
    <SignUp path="/accept-invite" routing="path" forceRedirectUrl="/app" />
  );
}

export default function AcceptInvitePage() {
  return (
    <Suspense fallback={<PageLoader />}>
      <AcceptInvite />
    </Suspense>
  );
}
