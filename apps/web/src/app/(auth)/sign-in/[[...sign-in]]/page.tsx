import { SignIn } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Sign in" };

/**
 * Clerk's sign-in: email + password, Google, GitHub, and "Forgot password?"
 * (a reset code by email). Brute-force protection (attempt limits and account
 * lockout) is enforced by Clerk.
 */
export default function SignInPage() {
  return <SignIn path="/sign-in" signUpUrl="/sign-up" fallbackRedirectUrl="/app" />;
}
