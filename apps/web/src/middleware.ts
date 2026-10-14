import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

/**
 * Protected routes: the customer app and the staff console need a signed-in
 * user (Clerk redirects to /sign-in otherwise). Whether someone is staff or a
 * super admin is checked again server-side in the staff layouts and by the
 * API on every request — the middleware only gates "signed in or not".
 */
const isProtected = createRouteMatcher(["/app(.*)", "/staff(.*)"]);

export default clerkMiddleware(async (auth, req) => {
  if (isProtected(req)) await auth.protect();
});

export const config = {
  matcher: [
    // Skip Next.js internals and static files.
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/(api|trpc)(.*)",
  ],
};
