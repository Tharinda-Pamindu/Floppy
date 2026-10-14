import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

/**
 * Protected routes: the customer app and the staff console need a signed-in
 * user; guests are sent to the home page. Whether someone is staff or a super
 * admin is checked again server-side in the staff layouts and by the API on
 * every request — the middleware only gates "signed in or not".
 *
 * Signed-in people have no use for sign-in / sign-up, so those send them to
 * /app (this also covers Clerk's /sso-callback steps after Google or GitHub).
 * /accept-invite stays open: signed-in people use it to join an organization.
 */
const isProtected = createRouteMatcher(["/app(.*)", "/staff(.*)"]);
const isGuestOnly = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  if (!userId && isProtected(req)) return NextResponse.redirect(new URL("/", req.url));
  if (userId && isGuestOnly(req)) return NextResponse.redirect(new URL("/app", req.url));
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
