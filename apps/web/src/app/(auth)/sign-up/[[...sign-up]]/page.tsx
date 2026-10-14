import { SignUp } from "@clerk/nextjs";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Create your account" };

/** Email + password (verified with a code), or Google / GitHub. */
export default function SignUpPage() {
  return <SignUp path="/sign-up" signInUrl="/sign-in" fallbackRedirectUrl="/app" />;
}
